# An admin's standing-fact text is saved as a trip fact, not as a trip

## The mindset of this PR

- Goal: When an admin types, as text only, a standing fact about a truck,
  driver or route (route, wage, freight rate per ton, allowance, billing
  customer, said to hold for every trip), the bot saves it as a trip fact with
  `save_fact` and says how many papers it applies to. It never saves that text
  as a one-off work record. The two such records saved on 17/11 are removed.
- What matters most: 1. No real trip is lost. An admin text about one trip, or
  any text whose wording does not clearly say "every trip", is saved as today.
  2. A clearly standing fact from an admin becomes a trip fact, and no record
  or document is created from it. 3. The cleanup removes exactly the two
  records and two documents named below, or nothing.
- Out of scope: Facts sent in the same message as a photo: the photo is still
  read as work data, and the change guard still refuses the save. Other admin
  texts saved as work records in the past (corrections, invites, the 12/11
  "tuyến cái mép cheng loong cước là 190k/tấn"). Member reads, sheet reads and
  operator rereads: they stay exactly as today. `save_fact`, fact matching, the
  reader schema and its validation.

## Outcome

Brief: The reader no longer treats an admin's clearly standing-fact text as
work data. The message goes to the admin chat, which saves it with
`save_fact`. The two "Vận chuyển, xe 93C04939" records saved from such texts on
17/11 are deleted.

Before: On 17/11 at 13:04 and at 17:05 (Vietnam time), the admin sent, as
text only: "Xe 93C04939 lấy bột đá BRTSP từ công ty TAICERA đến đổ hàng ở
công ty Gạch Men Thạch Anh… Lương tài xế 500k, cước vận chuyển 150k/tấn, chi
phí bồi dưỡng 300k, khách hàng là công ty Minh Đức Phát. Thông tin này luôn là
như vậy…". Both times the bot replied "Đã lưu: Vận chuyển, xe 93C04939." and
saved a work record plus a document of kind `tin nhắn` with no date. No trip
fact was saved (`facts` holds only the two plate facts), so the route report
later could not find the route.
After: The same text gets a reply that names the saved trip fact (xe 93C04939,
TAICERA → Gạch Men Thạch Anh) and its values, and says how many saved papers
it applies to. No record or document comes from it.

Steps (psql: README, "SQL from a local terminal"):

- Deploy. Run
  `select count(*) from documents where id in ('7609ad10-c829-401c-ad87-de47c7c2a40f','c06281a1-a72d-437d-95a2-4e35e597e480');`
  and the same for `records` with
  `'37cd85c3-2179-428c-8253-041d34c7c02f','53bcc7c3-67da-43c6-b8c9-f88b1b446151'`.
  Both return 0.
  `select count(*) from messages where id in ('9f2a1ad7-357a-4103-a4cb-2667f408b7b6','1d55ac34-7767-4f40-bbab-97cd1f79c2fc');`
  returns 2.
- Right after the deploy, in Zalo, as an admin, send the 93C04939 fact above
  again, text only. Until then the route is saved nowhere.
- The reply names the trip fact and "áp dụng cho N giấy tờ". It lists the five
  values, or names each value `save_fact` refused and why. It does not start
  with "Đã lưu: Vận chuyển". The logs show `[intake] message=<id> … 
  situation=no_work_data … route=admin_chat` and `[admin-chat] message=<id> …
  save_fact(…)` for that message.
- `select vehicle_plate, pickup_name, dropoff_name from facts where vehicle_plate = '93C04939' and pickup_name is not null;`
  returns one row with TAICERA and Gạch Men Thạch Anh.
  `select count(*) from document_sources where message_id = '<id of the message just sent>';`
  returns 0.
- As an admin, ask "So sánh tổng trọng lượng hàng giao cho từng công ty trong
  tháng 10 và tháng 11.", so the conversation now holds an answer with drivers'
  data. Then send "Xe 93C04959 từ nay mỗi chuyến lương tài xế 450k." The reply
  still names a saved trip fact for 93C04959.
- As an admin, send "Hôm nay xe 93C04939 giao 12 tấn bột đá cho Gạch Men Thạch
  Anh." The bot replies "Đã lưu: …" as today, because this is one trip.
- As a driver, send a text about a trip. It is saved as today.

## Bug and root cause

Bug: An admin types a standing fact about a truck and its route, as text
only. They expect it to be saved as a fact that applies to every matching
trip. The bot replies "Đã lưu: Vận chuyển, xe 93C04939." and saves one work
record, with no date, holding the route and the amounts. No trip fact exists
afterwards.
Reproduce: as an admin, send the 93C04939 text above with no photo.

Root cause: every text from a workspace member goes to the reader first
(`src/app/intake/read-message.ts`). Rule 1 of the reader prompt
(`src/app/reading/reader-prompt.ts:11`) marks a text as work data when it
holds "thông tin công việc cần lưu". Its exception for long-term information
covers only another member, not a truck or a route. So the reader returns a
work item, the intake saves it as a record and a document, and replies
"Đã lưu: …" (`src/app/intake/plan-reply.ts`, `run-reply-stage.ts`).
- A text-only message with no work data goes straight to the admin chat
  (`isSentToChat`, `src/app/intake/reply-to-message.ts:81`). A saved text
  that also asks something is saved first, marked as a pending question, and
  then goes to the chat with the note "Hệ thống đã lưu: …"
  (`answer-pending-question.ts`, `src/app/admin-chat/build-user-turn.ts`).
- On 17/11 13:04 the text asked something, so the chat ran with that note and
  only acknowledged it (no tool call). At 17:05 it asked nothing, so the chat
  did not run. `save_fact` was never called.

## Solution

- Reader prompt (`src/app/reading/reader-prompt.ts`)
  - Before: the admin-only rules are only the `named_driver` rule, added when
    `readWithReader` gets `namesDriver = true`, which `read-message.ts`
    passes for an admin sender. Rule 1 has no exception for trucks or routes.
  - After: rename that flag to say what it is (the sender is an admin), and
    add one more admin-only rule under it. It is added only for a live admin
    intake read, never for member reads, sheet reads (their own prompt) or
    operator rereads (which call `readWithReader` without the flag).
  - The rule: a text with no photo that states a fact about a truck, driver or
    route and says explicitly that it holds for every trip ("luôn", "mỗi
    chuyến", "từ nay", "cố định", "thông tin này luôn là như vậy") is not work
    data: `has_work_data` false, `needs_explanation` false, `items` empty.
    Without such wording, or with a specific trip (a date, a weight, "hôm
    nay"), the text is read as today.
  - Because `needs_explanation` stays false, the text is not marked unclear,
    so the reread with recent messages (`rereadUnclearText`, only for unclear
    text) does not run. Rereads during live intake go through
    `readMessage` and carry the same rule.
- Routing: no change. A text-only message with no work data already goes to
  the admin chat without writing any saved reply first, so the chat starts
  with no "Hệ thống đã lưu" note and the guard does not start refusing.
- Guard: no change. When earlier answers in the conversation hold drivers'
  data, the first chat turn refuses `save_fact`, and the existing retry with
  those answers hidden (`produceAnswer`, `answer-with-chat.ts`) saves it. The
  outcome step with the comparison report checks this.
- Admin prompt, trip-facts section (`src/app/admin-chat/admin-prompt.ts`): an
  admin text that states a standing fact is handled with the existing tools:
  `list_facts` first, then `save_fact` for a new fact or `update_fact` for a
  changed one. No other change.
- Reader schema and validation: unchanged.
- Cleanup, new data migration in `src/app/db/migrations/`:
  - Call `lockTables` first, on every table the deletes touch (README,
    "Migrations").
  - Delete each of the two documents only when all of these hold: its id, its
    workspace `1c942bdf-7a19-43fc-96a3-d0936713e7db`, a `document_sources` row
    for it with the expected message
    (`7609ad10-…` ← `9f2a1ad7-357a-4103-a4cb-2667f408b7b6`,
    `c06281a1-…` ← `1d55ac34-7767-4f40-bbab-97cd1f79c2fc`), and exactly one
    `document_sources` row in total. A failed condition deletes nothing.
    Lines, parties, sources and fact links go with it (delete cascades).
  - Delete each of the two records only when its id, workspace and
    `message_id` all match (`37cd85c3-…` ← `9f2a1ad7-…`, `53bcc7c3-…` ←
    `1d55ac34-…`).
  - Keep the messages, the bot replies and any `document_reads` rows, which
    point at messages, not documents. A second run deletes zero rows.
  - The migration runs as the schema owner, so row-level security does not
    limit it. The match conditions are the only safety.
  - Checked non-risk: the operator command `reread-documents` will not save
    these records again. It only picks messages with a photo or an existing
    record (`src/app/document-reads/find-messages-to-reread.ts:17`), and both
    messages are text-only.
- The trip fact itself is saved by the admin sending the text again right
  after the deploy (outcome step 2). That goes through `save_fact`, which links
  it to every matching saved paper. A migration cannot run that matching.
- README, "Save what the reader reads": add the admin standing-fact exception.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

Standing-fact texts are saved as work records again. The two deleted records
stay deleted. They were wrong data, and the trip fact replaces them.
