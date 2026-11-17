# Admins state standing facts that apply to every matching document

These PRs depend on each other and merge in the order written. Each one leaves
production working when it ships alone.

Facts every PR in this file relies on:

- A **document** is one saved paper (weigh ticket, invoice, delivery note) in
  the `documents` table. Its companies and places are rows in
  `document_parties` (roles `issuer`, `supplier`, `customer`, `carrier`,
  `place`), each with a `printed_name`, an accent-free `match_key` and, once
  known, an `organization_id`. Spellings of one company are rows in
  `organization_aliases` (`match_key` → `organization_id`). A document links to
  the chat messages it came from through `document_sources` → `messages`
  (`messages.user_id` is the sender).
- The **admin chat** is the chat model that answers an admin in Zalo
  (`src/app/admin-chat/`). It acts through tools listed in
  `src/app/admin-chat/tools/admin-tools.ts` and run by
  `src/app/admin-chat/tools/run-admin-tool.ts`. Tools that change data are
  listed in `CHANGE_TOOLS` in `src/app/admin-chat/tools/admin-text-guard.ts`.
  That guard refuses them when the message carries data read from a photo, or
  after the bot read member data in the same turn.
- Today an admin can save only a free-text sentence about one driver
  (`member_facts`, at most 200 characters per sentence). The reader uses it to
  fill blanks in that driver's next uploads. It never changes documents that
  are already saved.
- A **fact** (new in this file) is a standing statement an admin makes, such
  as: "Xe 93C04939 lấy bột đá BRTSP từ công ty TAICERA đến đổ hàng ở công ty
  Gạch Men Thạch Anh. Lương tài xế 500k, cước vận chuyển 150k/tấn, chi phí bồi
  dưỡng 300k, khách hàng là công ty Minh Đức Phát." It has a **scope** (which
  documents it applies to) and **values** (what it says about them). The values
  live only on the fact. Documents point to it, so a change to the fact
  changes every document at once.
- **Matching rule**: a document matches a fact when every scope field the fact
  fills matches:
  - Vehicle plate: `documents.vehicle_plate` equals the fact's plate.
  - Driver: the driver sent one of the document's source messages.
  - Each company in the scope (pickup, drop-off): one of the document's
    parties has that company's `match_key`, either directly or through an
    `organization_aliases` row of the party's organization. The party's role
    does not matter.
- **Two facts set the same value on one document** (same value name, compared
  accent-free): the fact updated most recently wins.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check.
- Schema changes follow the README "Migrations" rules: expand only, a new file
  per change, `lockTables` before touching an existing table, backfills in
  their own migration.

---

## PR 1: An admin saves a trip fact and it applies to every matching saved document

### The mindset of this PR

- Goal: An admin states a standing fact in chat. The bot saves it with its
  scope and values, links it to every saved document that matches, and says
  how many.
- What matters most: 1. Every matching saved document gets linked, and no
  other document does. 2. The values are saved exactly as the admin wrote them
  (numbers, units, names). 3. A value the bot cannot save is named in the
  answer.
- Out of scope: Listing, changing or removing facts. Linking documents
  uploaded after the fact is saved. Showing fact values in reports. Saving a
  fact in the same message as a photo: the guard still refuses it, and the
  admin resends the text alone.

### Outcome

Brief: An admin tells the bot a standing fact about a truck, driver or route.
The bot saves it once and applies it to every saved document of that trip.

Before: The admin sends the TAICERA → Gạch Men Thạch Anh fact. The bot can only
save free-text sentences of up to 200 characters about one driver. It saves
part of it or refuses, does not say which part, and changes no saved document.
After: The bot replies that it saved the fact. It lists the scope (xe 93C04939,
TAICERA, Gạch Men Thạch Anh) and each value (Lương tài xế 500.000đ, Cước vận
chuyển 150.000đ/tấn, Chi phí bồi dưỡng 300.000đ, Khách hàng Minh Đức Phát,
Hàng hóa bột đá BRTSP), and says it applies to N saved documents.

Steps:

- As a driver, send a photo of a weigh ticket for truck 93C04939 that names
  TAICERA and Gạch Men Thạch Anh. The bot replies "Đã lưu: …".
- As an admin, send the fact above as text only, with no photo.
- The reply lists the scope and the five values, and says it applies to 1
  saved document.
- In psql: `select count(*) from document_facts` returns 1, and `fact_values`
  holds five rows for the new `facts` row.
- As an admin, send a fact for a plate no document has, such as "Xe 51C99999
  lương tài xế 400k". The reply says it was saved and applies to 0 documents.

### Solution

- New: an admin tool that saves a fact with its scope and values, then links
  every saved document of the workspace that matches the matching rule above.
  - The scope is any of: vehicle plate, driver (a member id from
    `list_members`), pickup company, drop-off company. At least one is
    required.
  - Normalize the plate like `rewrite_member_plate` does
    (`src/app/admin-chat/tools/rewrite-member-plate-tool.ts`), and refuse a
    plate that does not match the same pattern.
  - Build company and value-name keys with `buildMatchKey`
    (`src/app/documents/build-match-key.ts`).
  - Each value is a name plus either a number with a unit (money in đồng,
    "đ" per trip, "đ/tấn" per ton) or a text (a customer or cargo name).
  - Save the fact and its links in one transaction, under the same workspace
    lock that document saving takes (`lockWorkspaceRecords`), so a document
    saved at the same moment cannot be missed.
  - The tool result lists the saved scope, each saved value, and the number of
    linked documents. Each value it refuses is listed with its reason.
- The tool is a change tool: add it to `CHANGE_TOOLS`.
- Admin prompt (`src/app/admin-chat/admin-prompt.ts`): add a section. When an
  admin states a standing fact about a truck, driver or route, with amounts or
  parties that hold for every trip, call the new tool once with every value.
  Do not split it into `add_member_fact` sentences. Keep `add_member_fact` for
  reading hints about one driver, such as how they write their papers. After
  saving, repeat the scope, every value and the document count. Name any value
  that was not saved.
- Schema:
  - New table `facts`: one row per standing fact an admin stated.
    - `id` uuid, not null, primary key, default `gen_random_uuid()`.
    - `workspace_id` uuid, not null, foreign key to `workspaces.id`, delete
      cascades.
    - `author_user_id` uuid, null, foreign key to `users.id`, on delete set
      null.
    - `statement` text, not null, check `btrim(statement) <> ''` and
      `char_length(statement) <= 2000`: the admin's words.
    - `vehicle_plate` text, null, check `vehicle_plate ~ '^\d{2}[A-Z]\d{3,5}$'`.
    - `driver_user_id` uuid, null. Foreign key (`workspace_id`,
      `driver_user_id`) to `memberships (workspace_id, user_id)`, delete
      cascades.
    - `pickup_name` text, null; `pickup_match_key` text, null, check
      `~ '^[a-z0-9]+$'`; check `(pickup_name IS NULL) = (pickup_match_key IS NULL)`.
    - `dropoff_name` text, null; `dropoff_match_key` text, null, check
      `~ '^[a-z0-9]+$'`; check `(dropoff_name IS NULL) = (dropoff_match_key IS NULL)`.
    - `created_at` timestamptz, not null, default `now()`.
    - `updated_at` timestamptz, not null, default `now()`.
    - Check: at least one of `vehicle_plate`, `driver_user_id`,
      `pickup_match_key`, `dropoff_match_key` is not null.
    - Unique index on (`id`, `workspace_id`).
    - Index on (`workspace_id`, `vehicle_plate`), not unique.
  - New table `fact_values`: one row per value a fact sets.
    - `id` uuid, not null, primary key, default `gen_random_uuid()`.
    - `workspace_id` uuid, not null.
    - `fact_id` uuid, not null. Foreign key (`fact_id`, `workspace_id`) to
      `facts (id, workspace_id)`, delete cascades.
    - `position` smallint, not null, check `>= 0`.
    - `name` text, not null, check `btrim(name) <> ''` and
      `char_length(name) <= 80`.
    - `match_key` text, not null, check `~ '^[a-z0-9]+$'`.
    - `number` numeric, null, check `number >= 0`.
    - `unit` text, null, check `unit IS NULL OR btrim(unit) <> ''`.
    - `text_value` text, null, check `text_value IS NULL OR btrim(text_value) <> ''`.
    - Check `(number IS NULL) = (unit IS NULL)`.
    - Check `(number IS NULL) <> (text_value IS NULL)`.
    - Unique index on (`fact_id`, `match_key`).
    - Unique index on (`fact_id`, `position`).
  - New table `document_facts`: one row per document a fact applies to.
    - `workspace_id` uuid, not null.
    - `document_id` uuid, not null. Foreign key (`document_id`,
      `workspace_id`) to `documents (id, workspace_id)`, delete cascades.
    - `fact_id` uuid, not null. Foreign key (`fact_id`, `workspace_id`) to
      `facts (id, workspace_id)`, delete cascades.
    - `created_at` timestamptz, not null, default `now()`.
    - Primary key (`document_id`, `fact_id`).
    - Index on (`fact_id`), not unique.
  - Row-level security on all three tables, the same policy as `member_facts`
    (`0053_create_private_memories_and_member_facts.ts`): visible and writable
    when `workspace_id` equals `app.workspace_id` and no `app.owner_user_id` is
    set. Admins see facts, members do not.

Tests: none (see the shared facts above).

### Revert cost

The tool disappears and admins can no longer save facts. The three tables and
their rows stay. Dropping them needs a later migration.

---

## PR 2: An admin lists the saved trip facts

Depends on: PR 1.

### The mindset of this PR

- Goal: An admin asks what facts are saved and sees each one with its scope,
  values and the number of documents it applies to.
- What matters most: 1. Every fact of the workspace is listed. 2. Values read
  exactly as saved. 3. The fact's id is in the tool result, so later changes
  can target it.
- Out of scope: Changing or removing facts. Facts in document lists or totals.

### Outcome

Brief: The admin chat can list saved facts, filtered by plate, driver or
company.

Before: The admin asks "Đã lưu thông tin gì về xe 93C04939?". The bot has no
way to read saved trip facts.
After: The bot lists the TAICERA → Gạch Men Thạch Anh fact with its five
values and "áp dụng cho N giấy tờ".

Steps:

- As an admin, save the TAICERA fact (text only) if it is not saved yet.
- Ask "Đã lưu thông tin gì về xe 93C04939?".
- The answer shows the scope, the five values and the document count.
- Ask "Đã lưu thông tin gì về xe 51C00000?" for a plate with no fact. The
  answer says nothing is saved for it.

### Solution

- New: an admin tool that lists the workspace's facts, optionally filtered by
  plate, driver or company name (accent-free match). Each fact comes with its
  id, statement, scope, values in position order, the number of linked
  documents and its last update time.
- The tool reads only admin data, so it goes into `ADMIN_TEXT_TOOLS`, not
  `MEMBER_TEXT_TOOLS`: listing facts does not block a change in the same turn.
- Admin prompt: when the admin asks what is saved about a truck, driver or
  route, call it. With no match, say so plainly.

Tests: none (see the shared facts above).

### Revert cost

Admins can no longer list facts. Saved facts and links are untouched.

---

## PR 3: New uploads link to the saved facts they match

Depends on: PR 1, PR 2.

### The mindset of this PR

- Goal: A document saved after a fact exists is linked to every fact it
  matches, at the moment it is saved.
- What matters most: 1. No matching upload is left unlinked. 2. Saving a
  document never fails because of fact linking. 3. A paper sent twice (one
  document with two source messages) is linked once.
- Out of scope: Changing what the reader reads. Showing the link in the
  driver's saved reply.

### Outcome

Brief: When a driver uploads a weigh ticket for truck 93C04939 between TAICERA
and Gạch Men Thạch Anh, the document is linked to that fact as soon as it is
saved.

Before: A fact applies only to documents that existed when it was saved.
After: Every new or updated document is checked against the saved facts and
linked to each match.

Steps:

- As an admin, save the TAICERA fact (text only). Note the document count it
  reports.
- As a driver, send a new weigh ticket photo for truck 93C04939 that names
  TAICERA and Gạch Men Thạch Anh. The bot replies "Đã lưu: …".
- As an admin, ask "Đã lưu thông tin gì về xe 93C04939?". The count is one
  higher.
- As a driver, send a weigh ticket for another truck. The count stays the
  same.

### Solution

- Document saving
  - Before: `storeDocuments` (`src/app/documents/store-documents.ts`) inserts a
    document or adds a source to an existing one, and nothing else.
  - After: in the same transaction and under the same lock, each stored
    document (new, or existing with a new source) gets linked to every fact of
    the workspace that matches it and is not linked yet.
- Matching follows the matching rule in the shared facts above. Reuse the
  matching from PR 1, so both paths decide a match the same way.

Tests: none (see the shared facts above).

### Revert cost

New uploads stop being linked. Existing links stay, and a fact saved later
still links them.

---

## PR 4: An admin changes a saved fact and every linked document follows

Depends on: PR 1, PR 2.

### The mindset of this PR

- Goal: An admin changes a value or the scope of a saved fact. The fact
  changes in one place, and the set of linked documents is recomputed when the
  scope changes.
- What matters most: 1. After the change, exactly the matching documents are
  linked. 2. Values not mentioned stay as they were. 3. The answer says what
  changed and the new document count.
- Out of scope: Removing a fact. History of earlier values.

### Outcome

Brief: "Từ nay lương tài xế xe 93C04939 tuyến TAICERA là 550k" updates the
saved fact, and every trip of that fact now reads 550.000đ.

Before: Facts cannot be changed. A new sentence would be a second, conflicting
fact.
After: The bot updates the fact, replies with the old and new value, and the
fact list shows 550.000đ with the same document count.

Steps:

- As an admin, with the TAICERA fact saved, send "Từ nay lương tài xế xe
  93C04939 chở từ TAICERA là 550k."
- The reply names the fact and says Lương tài xế changed from 500.000đ to
  550.000đ.
- Ask "Đã lưu thông tin gì về xe 93C04939?". It shows 550.000đ, the other four
  values unchanged, and the same document count.
- Send "Thông tin chuyến TAICERA đó áp dụng cho xe 93C11111 chứ không phải
  93C04939." The reply gives the new plate and the new document count.

### Solution

- New: an admin tool that changes one fact by id. It can set, replace or
  remove single values, and replace scope fields.
  - Values named in the call are set or removed. Other values stay.
  - When a scope field changes, recompute the links in the same transaction
    and under the workspace lock: remove links that no longer match, add new
    matches.
  - Set `updated_at` to now. The statement keeps the original sentence plus
    the admin's change sentence.
  - The result gives each changed value (old → new), the new scope and the
    document count.
- Change tool: add it to `CHANGE_TOOLS`.
- Admin prompt: when an admin updates a saved fact, find it with the list tool
  from PR 2 and change it. Do not save a second fact. When two facts could
  match, ask which one.

Tests: none (see the shared facts above).

### Revert cost

Facts can no longer be changed. Changes already made stay.

---

## PR 5: An admin removes a saved fact

Depends on: PR 1, PR 2.

### The mindset of this PR

- Goal: An admin removes a fact. Its values no longer apply to any document,
  and the documents themselves stay.
- What matters most: 1. No document or other fact is touched. 2. The bot
  confirms which fact was removed.
- Out of scope: Undo.

### Outcome

Brief: "Xóa thông tin chuyến TAICERA của xe 93C04939" removes that fact and its
links.

Before: Facts cannot be removed.
After: The bot removes the fact and names it. Listing facts for that truck no
longer shows it, and the documents are still there.

Steps:

- As an admin, with the TAICERA fact saved, send "Xóa thông tin chuyến TAICERA
  của xe 93C04939."
- The reply names the removed fact and how many documents it applied to.
- Ask "Đã lưu thông tin gì về xe 93C04939?". The fact is gone.
- Ask "Tháng này xe 93C04939 có bao nhiêu giấy tờ?". The count is the same as
  before the removal.

### Solution

- New: an admin tool that deletes one fact by id. Its values and links go with
  it (delete cascades). The result names the fact and its former document
  count.
- Change tool: add it to `CHANGE_TOOLS`.
- Admin prompt: find the fact with the list tool from PR 2 before removing it.
  When two facts could match, ask which one.

Tests: none (see the shared facts above).

### Revert cost

Facts can no longer be removed. Removals already made stay.

---

## PR 6: Document lists and the Excel export show each document's fact values

Depends on: PR 1.

### The mindset of this PR

- Goal: When an admin lists documents or exports them to Excel, each document
  shows the values its facts give it (driver wage, freight rate, allowance,
  billing customer).
- What matters most: 1. The values shown are the current fact values, read
  from the facts, never copied onto documents. 2. When two facts set the same
  value, the most recently updated fact wins. 3. Documents with no fact look
  as they do today.
- Out of scope: Totals of fact values. Members' views.

### Outcome

Brief: Fact values appear next to each document in `list_documents` results
and as columns in the Excel export.

Before: The Excel export of truck 93C04939 documents has no wage, freight rate
or customer columns.
After: The export has the columns "Lương tài xế", "Cước vận chuyển", "Chi phí
bồi dưỡng", "Khách hàng" and "Hàng hóa", filled for every linked document.

Steps:

- As an admin, with the TAICERA fact saved, send "Xuất Excel giấy tờ của xe
  93C04939 tháng này."
- Open the link. Each linked document's row has the five values. Documents
  with no fact have those cells empty.
- Change the wage to 550k (if PR 4 is merged) or save a newer fact for the same
  truck with Lương tài xế 550k, and export again. The rows show 550.000đ.
- Ask "Liệt kê các chuyến xe 93C04939 tháng này kèm lương tài xế." Each listed
  document shows its wage.

### Solution

- Follow the Excel export in `src/app/documents/build-documents-workbook.ts`
  and the listing in `src/app/documents/list-documents.ts`.
- Differences: each document carries its fact values (name, number with unit,
  or text), resolved through `document_facts` → `fact_values`. When two linked
  facts set the same value name, use the fact with the latest `updated_at`.
  The workbook adds one column per value name present in the export, after
  the existing columns.

Tests: none (see the shared facts above).

### Revert cost

Lists and exports lose the fact columns. Facts and links stay.

---

## PR 7: Admins get totals of fact values for reports

Depends on: PR 1.

### The mindset of this PR

- Goal: An admin asks for totals that use fact values, such as the total
  driver wage or freight revenue per month or per customer, and gets correct
  numbers.
- What matters most: 1. Each document counts once. 2. The same filters and
  groups as `total_document_numbers` apply, so reports line up. 3. Per-ton
  rates are combined with each document's weight, never summed as if they were
  amounts.
- Out of scope: New document filters. A general query tool.

### Outcome

Brief: A new admin tool totals a fact value over the matching documents,
grouped by day, month, company or truck.

Before: "Tổng lương tài xế xe 93C04939 tháng 11?" cannot be answered, because
the wage lives only in the admin's sentence.
After: The bot answers with the number of trips, the total wage and the trips
counted. For "Doanh thu cước tháng 11 theo khách hàng" it multiplies each
trip's rate per ton by that trip's weight.

Steps:

- As an admin, with the TAICERA fact saved and three linked documents in
  November, ask "Tổng lương tài xế xe 93C04939 tháng 11?".
- The answer is 3 trips × 500.000đ = 1.500.000đ.
- Ask "Doanh thu cước vận chuyển tháng 11 của xe 93C04939?". The answer is
  150.000đ/tấn times the total tons of those three trips, with the tons shown.
- Ask "Tổng chi phí bồi dưỡng tháng 11 của xe 51C99999?" for a truck with no
  fact. The answer says no fact gives that value.

### Solution

- Follow `total_document_numbers` (`src/app/documents/total-document-numbers.ts`
  and its spec in `src/app/admin-chat/tools/document-number-specs.ts`): the
  same document filters, `group_by` and accepted-only rule, plus the counts of
  documents waiting for review.
- Differences:
  - The input is a fact value name, compared accent-free.
  - Per group and unit, the result gives the number of documents, the sum of
    the value, and the distinct values with their document counts.
  - For a per-ton unit ("đ/tấn"), the result instead gives, per rate, the
    total weight in tons of those documents, read from their weight lines
    (kg divided by 1,000), and the rate × weight amount.
  - When two facts set the same value on a document, the most recently
    updated fact wins.
- It reads member data, so it goes into `MEMBER_TEXT_TOOLS`.
- Admin prompt: use it for any total of a value an admin stated as a fact.
  Show the trip count and, for rates, the weight used.

Tests: none (see the shared facts above).

### Revert cost

Totals of fact values are no longer available. Nothing else changes.

---

## PR 8: An admin uploads a document for a named driver

Depends on: PR 1, PR 2.

### The mindset of this PR

- Goal: When an admin sends a paper and names the driver it belongs to ("hóa
  đơn của tài xế Tuấn"), the saved document is tagged with that driver. That
  driver's plate and facts apply to it as if the driver had sent it.
- What matters most: 1. The document is tagged with the right driver, or with
  none when the name is unknown or matches two people, and the reply says
  which. 2. Drivers keep seeing only the messages they sent themselves: the
  tagged driver does not see the admin's upload. 3. Uploads with no driver
  named behave as today.
- Out of scope: Letting the driver see admin uploads. Tagging documents that
  are already saved. Uploads from members naming another driver.

### Outcome

Brief: An admin uploads a weigh ticket "của tài xế Tuấn". The document is saved
under Tuấn's truck and linked to Tuấn's facts. The reply names Tuấn.

Before: The document belongs only to the admin who sent it. The admin's own
facts are used, so Tuấn's plate and any driver fact for Tuấn do not apply.
After: The reply reads "Đã lưu cho tài xế Tuấn: …". The document carries
Tuấn's plate from his saved plate fact, and facts scoped to Tuấn link to it.

Steps:

- As an admin, make sure a member named Tuấn exists (`list_members`) and save a
  fact scoped to him, such as "Tài xế Tuấn lương 500k mỗi chuyến".
- Send a weigh ticket photo with the caption "Hóa đơn của tài xế Tuấn".
- The reply names Tuấn. Ask "Đã lưu thông tin gì về tài xế Tuấn?". The
  document count went up by one.
- Send a photo with the caption "Hóa đơn của tài xế Không Có". The reply says
  no driver of that name was found and the document was saved without a
  driver.
- As Tuấn, ask "Hôm nay tôi gửi gì?". The admin's upload is not listed.

### Solution

- Reader (`src/app/reading/`): when the sender is an admin, the reader also
  returns the driver name the admin wrote in the message or caption, or null.
  Members' readings are unchanged.
- Intake: resolve that name against the workspace's members by display name,
  accent-free. One match tags the document. No match or two matches tags none,
  and the saved reply says so.
- Document saving (`storeDocuments`): for a tagged document, the known plate
  comes from the tagged driver's plate fact instead of the sender's.
- Saved reply (`src/app/records/format-saved-reply.ts`): when a driver is
  tagged, the reply starts with "Đã lưu cho tài xế <name>:".
- Matching rule
  - Before: a driver-scoped fact matches a document when the driver sent one
    of its source messages.
  - After: it also matches when the document is tagged with that driver.
- Member visibility (row-level security on `documents`) stays as it is.
- Schema:
  - `documents`: new column `driver_user_id` uuid, null, no default.
  - Foreign key (`workspace_id`, `driver_user_id`) to `memberships
    (workspace_id, user_id)`, `ON DELETE SET NULL (driver_user_id)`, added
    `NOT VALID` in this migration and validated in a second migration in the
    same PR (README rule for constraints on existing tables).
  - No backfill: existing documents keep `driver_user_id` null, and their
    driver stays the sender of their source messages.

Tests: none (see the shared facts above).

### Revert cost

Admin uploads stop being tagged. Tags already written stay in the column, and
nothing reads them.

---

## PR 9: Each driver's saved plate becomes a fact

Depends on: PR 1, PR 2.

### The mindset of this PR

- Goal: Every driver's plate, saved today as a free-text member fact, also
  exists as a driver-scoped fact linked to that driver's documents. Plate
  changes made later keep that fact current.
- What matters most: 1. One plate fact per driver, holding the plate the
  system uses today (the latest member fact that contains a plate). 2. The
  backfill can run again without making duplicates. 3. The reader hints in
  `member_facts` stay untouched.
- Out of scope: Other free-text member facts. Changing how the reader uses
  member facts.

### Outcome

Brief: After the migration, "Đã lưu thông tin gì về tài xế Tuấn?" shows his
plate as a fact, linked to his documents. `rewrite_member_plate` updates that
same fact.

Before: A driver's plate is a sentence such as "Biển số xe: 93C04939" in
`member_facts`. It does not appear among the facts.
After: Each such driver has one fact scoped to them with the value "Biển số xe"
= the plate, linked to every document they sent.

Steps:

- In psql before deploying, note a driver whose `member_facts` holds
  "Biển số xe: 93C04939".
- Deploy. The deploy log shows `[migrate] applied: …` with the backfill.
- As an admin, ask "Đã lưu thông tin gì về tài xế <that driver>?". The plate
  fact shows, with the number of documents that driver sent.
- Send "Từ nay mọi giấy tờ của <that driver> lưu dưới biển 93C05555". Ask
  again. The plate fact shows 93C05555, and there is still only one plate
  fact.

### Solution

- New backfill migration, in its own file: for each driver (workspace,
  `member_user_id`) whose `member_facts` holds a sentence with a plate, take
  the latest such sentence by `created_at`, as `extractPlateFromFacts` does
  (`src/app/documents/plate-from-facts.ts`, same pattern). Create one fact:
  - scope: driver = that member;
  - one value named "Biển số xe", a text holding the normalized plate;
  - `statement` = the original sentence; `author_user_id` = the sentence's
    author.
  - Link it to the documents that driver sent, by the matching rule.
  - Skip drivers who already have a driver-scoped fact with a "Biển số xe"
    value, so the migration can run again.
- `rewrite_member_plate`
  (`src/app/admin-chat/tools/rewrite-member-plate-tool.ts`)
  - Before: it rewrites the plate on the driver's documents and adds a
    member-fact sentence.
  - After: it also sets the "Biển số xe" value of the driver's plate fact,
    creating that fact when missing, in the same transaction.

Tests: none (see the shared facts above).

### Revert cost

`rewrite_member_plate` stops updating the plate fact. Plate facts already
created stay, and an admin can remove them.
