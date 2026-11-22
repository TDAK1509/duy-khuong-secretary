# Admins define their company's documents, and the reader follows them

These PRs share one file because PR 2, PR 3 and PR 4 each need PR 1. PR 2,
PR 3 and PR 4 do not need each other and can merge in any order after PR 1.

Facts every PR in this file relies on:

- One generic reader prompt reads every photo and text for every company
  (`src/app/reading/reader-prompt.ts`, `document-rules.ts`). Per workspace it
  only gets name lists (`src/app/documents/list-reader-catalog.ts`, capped at
  30 kinds, 50 companies, 60 meanings): each is a wrapped `<retrieved-data>`
  part (`src/app/reading/retrieved-data.ts`). Nothing tells it which details a
  company needs from a given form, or whether that form is a pickup
  (`dispatch`) or drop-off (`receipt`) paper.
- What that costs, measured on the one production workspace: a drop-off weigh
  ticket form saved its goods line on 24 of 138 papers; a pickup weigh ticket
  form had no stage on 12 of 92 papers; the same weigh times were saved under
  two different meaning names on one form (51 papers against 40).
- Each workspace is one transport company. Templates are per workspace. The
  admin defines them in Zalo chat; the bot drafts them and asks.
- Document lines: `label` (any text), `number`, `unit`, `at`, `item`, and
  `meaning_id`. A meaning (`meanings`, keyed by workspace, `value_type`
  `number` or `date`, match key) is required for a number or a time; a text
  line has no meaning. Workspace tables use composite `(id, workspace_id)`
  foreign keys and row-level security
  (`src/app/db/migrations/0037_create_document_tables.ts`).
- Admin chat tools need a spec, a handler, an entry in `ADMIN_TOOLS`
  (`admin-tools.ts`) and `run-admin-tool.ts`, a guard class in
  `admin-text-guard.ts`, and a line in the ability section. The guard refuses
  a `CHANGE_TOOLS` tool after a `MEMBER_TEXT_TOOLS` tool in the same turn.
- No admin tool edits a saved paper's kind, stage or lines today.
  `rewrite_member_plate` edits plates and `split_merged_name` edits party
  links.
- Picking a template is a separate, cheap model call before the read, so the
  read carries one template, not all of them. Measured on 80 production photos
  with 12 sample templates: `gpt-6-luna` with the full-detail image picked
  right on 76 (95%; two of its four misses were sample labels that were
  themselves doubtful), about 1.2 s and $0.0002 per pick; a low-detail image
  dropped to 85%; `gpt-6.1-sol` picked right on 78 for 20 times the price.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check. The repo is public: no
  production names, plates or ids in committed files.

---

## PR 1: An admin defines document templates in chat, and new papers are read with them

### The mindset of this PR

- Goal: An admin can ask the bot to propose templates from the company's saved
  papers, confirm or correct them in chat, list, change and delete them. Every
  new photo or text from that workspace is read with its templates: a paper
  that matches a template gets the template's kind and stage, its details are
  saved under the template's names and meanings, and the paper records which
  template it matched.
- What matters most: 1. A template never makes a reading wrong: a paper that
  matches no template is read exactly as today. 2. Only admins create, change or
  delete templates, and template text is data to the reader, never an
  instruction. 3. Few chat turns for the admin, and a read that costs about
  the same as today.
- Out of scope: Rereading saved papers (PR 2). The offer to new admins (PR 3).
  Asking the driver about a missing required detail (PR 4). Templates shared
  across companies. Admin sheets (the sheet reader is unchanged).

### Outcome

Brief: Two new tables hold each workspace's templates and their fields. New
admin tools propose templates from saved papers, save, list and delete them.
Before each read, one small picker call chooses the template the paper
matches, or none. The read then carries only that template, with a fixed rule,
and returns whether the paper really is that form. A paper stores its template.

Before: A driver sends a drop-off weigh ticket from a factory whose form shows
the goods only as a material code and a specification line. The paper is
saved without a "Hàng hóa" detail and sometimes without a stage.
After: The admin has a template for that factory's ticket: drop-off stage,
required goods, weight and both weigh times. The same photo is saved with kind
and stage from the template, and the goods under "Hàng hóa".

Steps, for the owner (after deploy):

- In Zalo, as an admin, send "Đề xuất mẫu giấy tờ từ các phiếu đã lưu". The bot
  lists up to 5 proposals. Each names the issuer, the kind, pickup or drop-off,
  the details with how often they were saved, the gaps, and how many saved
  papers it covers.
- Reply "Lưu mẫu thứ nhất, hàng hóa là bắt buộc". The bot answers that the
  template is saved and names its fields.
- As a driver, send a new photo of that issuer's ticket. The reply "Đã lưu: …"
  shows the template's kind and the goods.
- As the admin, send "Liệt kê 5 phiếu gần nhất theo mẫu <tên mẫu>". The new
  ticket is listed.
- Send "Xóa mẫu <tên mẫu>". The bot confirms. A new photo of that ticket is read
  as before the template.

Steps, for the developer (before merging, with the owner's OK for billable
reads that send production photos to the model, a few cents; read-only over
`ssh render_personal`, nothing written):

- Re-read 20 recent production photos twice, with and without one template
  built from the most common issuer. Papers of that issuer follow the template.
  Papers of other issuers read the same as without it. Report the picker's
  right, wrong and none picks, and the input tokens of both runs.

### Solution

- New table `document_templates`: one row per document form an admin has
  defined for a workspace.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null, foreign key to `workspaces.id`, delete
    cascades.
  - `name` text, not null, check `btrim(name) <> '' AND char_length(name) <=
    80`: the admin's name for the form, for example "phiếu cân nhà máy A".
  - `name_key` text, not null, check that it matches the match-key format used
    by `organizations.match_key`.
  - `kind` text, not null, check `btrim(kind) <> '' AND char_length(kind) <=
    60`: the document kind saved on matching papers.
  - `issuer_organization_id` uuid, null: the company that prints the form.
  - `description` text, not null, default `''`, check
    `char_length(description) <= 200`: how to recognise the form.
  - `stage` text, null, check `stage IN ('dispatch', 'receipt')`.
  - `revision` integer, not null, default 1: raised by every change.
  - `created_by_user_id` uuid, null.
  - `created_at`, `updated_at` timestamptz, not null, default now().
  - Unique index on (`id`, `workspace_id`); unique index on (`workspace_id`,
    `name_key`).
  - Foreign keys (`issuer_organization_id`, `workspace_id`) to `organizations`
    (`id`, `workspace_id`), on delete set null of `issuer_organization_id`;
    (`workspace_id`, `created_by_user_id`) to `memberships` (`workspace_id`,
    `user_id`), on delete set null of `created_by_user_id` (as
    `documents.driver_user_id` does).
- New table `document_template_fields`: one row per detail a template asks for.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null.
  - `template_id` uuid, not null; foreign key (`template_id`, `workspace_id`)
    to `document_templates` (`id`, `workspace_id`), delete cascades.
  - `position` smallint, not null, check `position BETWEEN 1 AND 20`.
  - `name` text, not null, check `btrim(name) <> '' AND char_length(name) <=
    60`: the label saved on the line.
  - `name_key` text, not null, match-key format.
  - `value_type` text, not null, check `value_type IN ('text', 'number',
    'date')`.
  - `unit` text, null, check `unit IS NULL OR value_type = 'number'`, one of
    the reader's standard units.
  - `required` boolean, not null, default false.
  - Unique (`template_id`, `position`); unique (`template_id`, `value_type`,
    `name_key`).
- Both tables get row-level security like the other workspace tables.
- `documents`: new column `template_id` uuid, null, no default; foreign key
  (`template_id`, `workspace_id`) to `document_templates`, on delete set null
  of `template_id`. Index on (`workspace_id`, `template_id`) built
  concurrently in its own migration (`pgm.noTransaction()`). Lock `documents`
  in the column migration.
- Limits, checked in code under the workspace lock: 50 templates per
  workspace, 20 fields per template.
- Admin tools (follow `save_fact`, `list_facts`, `delete_fact`; wire each one
  in the spec, handler, `ADMIN_TOOLS`, `run-admin-tool.ts`, guard class and
  ability section):
  - New: propose templates (`MEMBER_TEXT_TOOLS`, it reads drivers' papers).
    The server groups the workspace's accepted papers that are not saved from
    sheets by issuer company and kind, and returns for the top 5 groups: the
    issuer, kind, paper count, stage counts, each detail label or meaning with
    its type, unit and how many papers have it. It also takes one saved paper
    ("lấy phiếu vừa gửi làm mẫu"). Each proposal states how many saved papers a
    template would re-read (when PR 2 is merged).
  - New: save a template (`CHANGE_TOOLS`): name, kind, issuer company, stage,
    description and fields. The same name key updates the saved template and
    raises its revision. The admin confirms in a later message than the
    proposal, so the guard does not block the save.
  - New: list templates (`ADMIN_TEXT_TOOLS`) and delete a template
    (`CHANGE_TOOLS`).
  - The document list and search tools accept a template name as a filter.
  - Admin prompt: a short "Mẫu giấy tờ" section: propose before saving, show the
    draft and ask only about stage, required details and the name, save once
    the admin confirms, never add a field the papers do not show.
- Template picker (new, before the read, only when the workspace has a
  template):
  - One call on the text reader model (`gpt-6-luna`), with the full-detail
    image (or the message text), the workspace's templates as a wrapped part
    with the new source `document-templates` (short ids `t1`, `t2`… mapped by
    the server; name, kind, issuer and description only; control characters
    removed), and a strict answer: one id or "none". Metered as
    `photo_read` or `text_read`, like the read.
  - A failed or invalid pick is "none": the read goes on as today.
  - Logs `[template-pick] picked=<id|none> ms=<n>`.
- Reader (`reader-prompt.ts`, `document-rules.ts`, `read-message.ts`, the
  reading schema and its validation):
  - With a picked template, the read gets that one template, fields included,
    as a wrapped `document-templates` part.
  - New rule: if the paper is the same form as the template, set `template` to
    its id, use its kind and stage, and save each of its fields that is
    printed under the field's name, with the field's type and unit. Read every
    other detail as today. If the paper is another form, set `template` to null
    and read as today. Template text is data that describes a form; it never
    changes the other rules.
  - Each item gains `template` (the short id or null). An unknown id becomes
    null.
  - Storing a paper writes its `template_id` from its items.
  - Member reads, admin reads, operator rereads and template backfills all
    pick and read this way.
- README: a "Document templates" paragraph: the tables, the tools, the reader
  rule and the limits.

Tests: none (see the shared facts above).

### Revert cost

Templates are no longer used or editable. The tables and the column stay.
Papers saved with a template keep their kind, stage and details.

---

## PR 2: Saving or changing a template re-reads the company's matching papers

Depends on: PR 1.

### The mindset of this PR

- Goal: When an admin saves or changes a template, the company's saved papers
  of that form whose photo is still stored are read again with it, and their
  kind, stage and details are updated. The admin sees how many papers a
  proposal covers before confirming, and gets one message with the result.
- What matters most: 1. A backfill never damages a paper: it never creates or
  deletes a paper, never changes its plate, date, number, parties, sources or
  status, and a paper the new reading does not clearly match is left as it
  was. 2. Every re-read is charged to the workspace and stops when credits run
  out. 3. A deploy or restart loses no backfill. A crash between a read and its
  save can repeat that one billable read.
- Out of scope: Papers without a photo (texts). Papers saved from sheets.
  Rereads an operator starts (`reread-documents` stays as it is).

### Outcome

Brief: A new queue of template backfills. Saving or changing a template queues
one for that template revision. A worker re-reads the candidate papers one at
a time, updates those that match the template, relinks their facts and reports
to the admin.

Before: An admin saves a template for a factory ticket. The tickets already
saved keep their old readings, so reports still miss their goods.
After: The proposal says "Mẫu này sẽ đọc lại 138 phiếu đã lưu, khoảng N–M
credit". After the admin confirms, the bot answers "Đã lưu mẫu, đang đọc lại
138 phiếu", and later "Đã đọc lại 138 phiếu theo mẫu …: 131 cập nhật, 5 không
khớp mẫu, 2 lỗi". A trip report then shows the goods for those tickets.

Steps, for the owner:

- As an admin, ask for proposals and save one for a form with many saved
  papers. The proposal named the number of papers and the credit range.
- Wait for the result message. It gives the counts.
- Ask "Liệt kê 5 phiếu gần nhất theo mẫu <tên mẫu>". They show the template's
  kind and the goods, including papers saved before the template.
- Change one field ("bỏ mã vật tư khỏi mẫu …"). The bot says a new re-read has
  started, and a result message follows. Only one result comes for that
  template.

Steps, for the developer (local, nothing committed):

- Save a template, stop the service during its backfill and start it again. The
  backfill continues where it stopped, and one result message comes.
- Change the template while its backfill runs. The old run stops as
  superseded, and only the new run sends a result.
- Set the workspace's credit balance to 1 and save a template. The backfill
  stops, and the admin is told how many papers were not re-read and why.

### Solution

- New table `template_backfills`: one run of one template revision.
  - `id` uuid, not null, primary key, default `gen_random_uuid()`.
  - `workspace_id` uuid, not null, foreign key to `workspaces.id`, delete
    cascades.
  - `template_id` uuid, not null; foreign key (`template_id`, `workspace_id`)
    to `document_templates` (`id`, `workspace_id`), delete cascades.
  - `template_revision` integer, not null.
  - `requested_by_user_id` uuid, null; foreign key (`workspace_id`,
    `requested_by_user_id`) to `memberships` (`workspace_id`, `user_id`), on
    delete set null of `requested_by_user_id`.
  - `status` text, not null, default `'pending'`, check `status IN ('pending',
    'done', 'stopped', 'superseded')`.
  - `document_ids` uuid[], not null, check `cardinality(document_ids) <= 5000`:
    the candidates, fixed when queued.
  - `next_index` integer, not null, default 0.
  - `updated_count`, `unmatched_count`, `skipped_count`, `failed_count`
    integer, not null, default 0.
  - `stop_reason` text, null, check `char_length(stop_reason) <= 200`.
  - `claim_token` uuid, null; `locked_until` timestamptz, null; `attempts`
    smallint, not null, default 0.
  - `created_at` timestamptz, not null, default now(); `finished_at`
    timestamptz, null.
  - Index on (`created_at`) where `status = 'pending'`, concurrently, in its
    own migration (`pgm.noTransaction()`).
  - Row-level security like the other workspace tables.
- Candidates: accepted papers with `sheet_signature IS NULL`, no source from a
  sheet file, and a source photo message with `image_key IS NOT NULL AND
  image_deleted_at IS NULL`; and either `template_id` is this template, or the
  issuer party's company is the template's issuer, or (template without
  issuer) the same kind. The re-read decides: only papers whose new reading
  matches this template are updated.
- Queueing: saving a new template, or changing its kind, stage, issuer or
  fields, queues a run for the new revision in the same transaction. Pending
  runs of older revisions of that template become `superseded`. The save
  result gives the candidate count. The propose result gives the same count
  and a credit range from the workspace's recent photo reads.
- Worker: follow the sheet workers (`src/app/sheet-files/`): claim with `FOR
  UPDATE SKIP LOCKED`, a token and a lease; every write is fenced by token,
  `status = 'pending'` and the template's current revision; growing retry
  waits; a held-runs registry like `held-files.ts` with a fenced hand-back on
  shutdown that clears the token and lease and returns the attempt. One paper
  per step:
  - Before the read, stop with `stopped` when the workspace balance is 0 or
    below. One read can take the balance below 0, as for other actions.
  - Re-read the paper's photo message with the current templates, metered
    with a new charged call kind `template_backfill` (allowed by the
    `llm_calls` kind check, not an operator kind).
  - A missing photo counts as skipped.
  - Build the drafts from the reading the way intake does (group the items into
    documents). Take the one draft with the paper's document number, issuer,
    date and a compatible plate, whose items matched this template. Zero or
    several: count as unmatched, change nothing.
  - In one transaction under the workspace lock, fenced: delete the paper's
    `document_facts` rows and lines; find or insert meanings; insert the
    draft's lines; set the paper's kind, stage and `template_id`; relink the
    paper's facts; advance `next_index` and the counts.
  - A superseded or deleted template discards the read and writes nothing.
- Result: one message to the requesting admin (any admin when that admin is
  no longer a member) with the counts, or the stop reason.
- README: the backfill paragraph.

Tests: none (see the shared facts above).

### Revert cost

Saving a template no longer re-reads papers. Papers already updated keep their
new readings. The table stays.

---

## PR 3: A new admin is offered to define the company's documents

Depends on: PR 1.

### The mindset of this PR

- Goal: Each admin is offered once, in Vietnamese, to define the company's
  documents. A "có" starts the template conversation.
- What matters most: 1. Offered once per admin. 2. The bot understands a short
  "có" as the answer to the offer. 3. The offer never delays or replaces an
  answer the admin asked for.
- Out of scope: Drivers. Reminders.

### Outcome

Brief: A new admin's join reply ends with the offer. An admin who joined
before this PR, in a workspace with no template, gets the offer once, at the
end of the bot's next answer. The chat context tells the model the offer was
made.

Before: A new admin sends the invite code and gets "Bạn đã vào nhóm … Bạn có thể
hỏi Trợ lý về dữ liệu của nhóm …".
After: The same reply ends with: "Anh/chị có muốn khai báo các loại giấy tờ của
công ty không? Trợ lý sẽ đề xuất mẫu từ các phiếu đã lưu, hoặc anh/chị gửi một
ảnh mẫu, rồi chọn thông tin cần lưu. Nhờ vậy giấy tờ tài xế gửi được đọc đúng
hơn. Trả lời "có" để bắt đầu."

Steps, for the owner (needs a second Zalo account that is not in the
workspace):

- As an existing admin, send "Tạo mã mời quản lý tên Thử". The bot replies with
  a code.
- From the second Zalo account, send that code to the OA. The join reply ends
  with the offer.
- Reply "có". The bot proposes templates, or asks for one example photo per form
  when the company has no saved papers.
- As an existing admin of a workspace with no template, ask any question. The
  answer ends with the offer. Ask again: no offer.

Steps, for the developer (local): set `document_setup_offered_at` to null for
an admin in a workspace with no template, send a question, and check the
stored answer ends with the offer and the column is set.

### Solution

- `memberships`: new column `document_setup_offered_at` timestamptz, null, no
  default. Lock `memberships` in the migration.
- Join reply (`conversation-texts.ts`, `handle-inbound-event.ts`): for role
  `admin`, the offer after `JOINED_ADMIN_HINT`, and the join sets the column.
- Admin chat (`answer-with-chat.ts`): when the admin's column is null and the
  workspace has no template, append the offer to the answer before it is
  stored and sent, and set the column in the same transaction.
- Chat context: while the workspace has no template and the offer was made in
  the last 7 days, the wrapped `profile` part says so, so a short "có" is read
  as the answer.
- Admin prompt: when the admin accepts the offer, propose templates; with no
  saved papers, ask for one example photo per form.
- README: the offer.

Tests: none (see the shared facts above).

### Revert cost

The offer is no longer sent. The column stays.

---

## PR 4: A paper missing a required detail of its template asks the driver for a better photo

Depends on: PR 1.

### The mindset of this PR

- Goal: When a driver's paper matches a template and a required field could not
  be read, the paper is still saved, and the reply tells the driver which
  detail is missing.
- What matters most: 1. Nothing is lost: the paper is saved as today. 2. The
  driver understands what to do in one line. 3. No extra model call.
- Out of scope: Blocking the save. Repairing the saved paper from a second
  photo (a resend of the same ticket is a duplicate, as today). Backfills.

### Outcome

Brief: Before the saved reply is written, the server compares each read item
that matched a template with that template's required fields, and adds one
line per paper with missing details.

Before: A driver sends a blurred ticket. The reply "Đã lưu: …" lists what was
read. Nobody notices that the goods are missing.
After: The reply ends with "Chưa đọc được: Hàng hóa. Lần sau bạn chụp rõ phần
này nhé."

Steps, for the owner:

- As an admin, save a template with "Hàng hóa" required.
- As a driver, send a photo of that form with the goods covered by a finger.
  The paper is saved, and the reply ends with the line above.
- Send a clear photo of another ticket of the same form. The reply has no such
  line.

### Solution

- Saved reply (`src/app/intake/plan-reply.ts`): from the validated read items,
  for each item with a template, list the template's required fields that have
  no detail of the same name key and type. Add one line per paper in the
  message, naming the paper when the message has several.
- README: the line.

Tests: none (see the shared facts above).

### Revert cost

The reply no longer names missing details. Nothing stored changes.
