# An admin's file is always read or explained, and its caption goes with it

These PRs are independent and can merge in any order.

Facts every PR in this file relies on:

- An admin can upload a `.xlsx` or `.csv` sheet in Zalo. The webhook keeps
  only file attachments with those extensions
  (`src/providers/messaging/zalo-oa-channel.ts`, file event parsing).
  `receive-file.ts` downloads the file, stores it in `message_files` (with
  the file name as the message text) and replies with a receipt. The parse
  worker (`run-parse-files-step.ts`) replies with the headers, and the process
  worker (`run-process-files-step.ts`) has the sheet reader
  (`sheet-reader-prompt.ts`) save rows as documents and replies with the
  result. That is three replies today.
- Downloads go through `downloadAttachment` (`zalo-oa-channel.ts`): HTTPS
  only, no credentials, host in `ZALO_MEDIA_HOSTS` (default `zdn.vn,zadn.vn`,
  `src/bootstrap/zalo-config.ts:7`; `render.yaml` does not set it), every
  redirect checked again, and every resolved address public. Every failure is
  returned as `unavailable`.
- On 19/11 an admin sent a sheet. The signed webhook gave a file URL on a
  `dlfl.vn` host. The download was refused, and `handleDownloadFailure` sent
  the `unavailable` result to `dropSignatureMismatch`, which finished the event
  with only a log line (`[intake] file signature does not match extension`).
  No reply was sent.
- Zalo sends a file's caption as its own `text` event about one second before
  the `file` event, both with `sent_at` in the payload. Events of one sender
  are processed in order, but a later event only blocks once it is stored
  (`claim-inbound-event.ts`). On 19/11 the caption was claimed and answered
  alone: the admin chat saved it as a content-free member note on one driver.
  It later searched before trying to delete the note, so the change guard
  refused the delete.
- Photos already use captions (`intake-parts.ts`) and read recent texts as
  context (`find-recent-messages.ts`, `reread-with-recent-messages.ts`), with
  the texts marked as untrusted data. That lookup goes backward and does not
  consume the text.
- The change guard (`admin-text-guard.ts`) refuses change tools only after a
  `MEMBER_TEXT_TOOLS` tool ran in the turn. Lookup tools such as
  `list_members`, `list_member_facts` and `list_facts` do not trigger it. The
  guard's notice (`chat-texts.ts`) already names each refused action and asks
  the admin to send it again on its own.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check. The repo is public: no
  production names or ids in committed files.

---

## PR 1: A sheet from Zalo's file host is downloaded, and a failed sheet gets a reply

### The mindset of this PR

- Goal: A sheet an admin sends is downloaded and read. When a recognized sheet
  cannot be downloaded or is not a real sheet, the admin is told so.
- What matters most: 1. No recognized sheet event ends in silence. 2. Every
  existing download safety check stays. 3. The reply says what to do next.
- Out of scope: New file types. Attachments the webhook already drops (no
  `.xlsx`/`.csv` name). What the sheet reader saves.

### Outcome

Brief: The host seen on 19/11 is added to the allowed download hosts. A sheet
that fails to download, or is not a real sheet, gets a reply instead of
silence.

Before: An admin sends a sheet served from a `dlfl.vn` host. Nothing comes
back.
After: The same sheet is downloaded and read, with the usual replies. A sheet
that still cannot be downloaded gets "could not download, please send again".

Steps, for the owner:

- Deploy. In Zalo, as an admin, send a small `.xlsx` sheet. The usual receipt,
  headers and result replies arrive.
- Send a text file renamed to `.xlsx`. The bot replies that the file is not a
  readable Excel or CSV file.

Steps, for the developer (local, a throwaway script or REPL, nothing
committed):

- Call the file intake with a URL on a host outside the list. The admin reply
  is queued ("could not download"), and the log shows
  `[intake] file download failed: <reason>` with no query string.

### Bug and root cause

Bug: An admin sends a sheet and gets no reply. The sheet is never stored or
read.
Reproduce: send a sheet whose Zalo file URL is on a `dlfl.vn` host.

Root cause: the host is not in `ZALO_MEDIA_HOSTS`, so `downloadAttachment`
refuses it and returns `unavailable`. `handleDownloadFailure`
(`src/app/intake/receive-file.ts`) passes that to `dropSignatureMismatch`,
which finishes the event with no reply.

### Solution

- Allowed hosts
  - Before: default `zdn.vn,zadn.vn`.
  - After: default `zdn.vn,zadn.vn,dlfl.vn` in `src/bootstrap/zalo-config.ts`.
    The README says `dlfl.vn` was seen in a verified Zalo webhook for files
    (its ownership is not confirmed). Only the list changes. HTTPS only, no
    credentials, redirect re-checks, public-address checks and suffix matching
    all stay.
- `DownloadResult` gains safe reason codes: `host_refused`, `network`, `http`,
  `too_large`. They are logged without query strings.
- File failures (`receive-file.ts`), each with a reply through
  `refuseFileEvent`:
  - download failed (any reason but `too_large`): the file could not be
    downloaded, please send it again; if it fails again, tell the operator.
    Log `[intake] file download failed: <reason>`.
  - not a real `.xlsx` or `.csv` (signature check): the file is not a readable
    Excel or CSV file. Log `[intake] file is not a sheet: <event id>`.
  - too large: as today.
- `render.yaml` is not changed.
- README: the host list note and the replies.

Tests: none (see the shared facts above).

### Revert cost

Sheets from `dlfl.vn` are refused again, and failures go back to silence.

---

## PR 2: A text sent just before a sheet is that sheet's caption, and change requests are not blocked by searching first

### The mindset of this PR

- Goal: When an admin sends a short text and, within 5 seconds, a sheet, the
  text is that sheet's caption. It guides the sheet reader and is not
  answered or saved on its own. Separately, a request to change or delete a
  saved fact or note is not refused because the bot searched first.
- What matters most: 1. A caption never becomes a fact or a note on its own,
  and each caption belongs to exactly one sheet, even on retries. 2. The
  caption guides the reading but stays untrusted data. 3. Admin texts with no
  sheet are answered as today, at most a few seconds later.
- Out of scope: Captions for photos (already handled). Members' texts.
  Merging the three sheet replies into one.

### Outcome

Brief: An admin's text event waits until 5 seconds after it was sent. If a
sheet event from the same admin was sent within those 5 seconds, the text is
stored as that sheet's caption and gets no reply of its own. The sheet reader
receives the caption as an untrusted hint. The admin prompt avoids member-data
searches before a change.

Before: An admin sends "this is the GPS info of the trucks, plates in column
C, save it" and a sheet. The text is saved as a note on one driver, and the
sheet is never read. Asking to fix it gets "I can't".
After: The text gets no reply of its own. The sheet gets its usual replies,
read with the caption's hint. No note is saved from the caption. Asking to
delete a wrong note deletes it.

Steps, for the owner:

- In Zalo, as an admin, send "Đây là bảng GPS của các xe, biển số ở cột C, lưu
  lại", and right after it a small sheet with plates in column C.
- No reply comes for the text itself. The usual receipt, headers and result
  replies come for the sheet, and the result mentions the caption's hint.
  "Đã lưu thông tin gì về các tài xế?" shows no new note.
- Send "Xóa thông tin 'Thông tin GPS gắn trên các xe.' của tài xế <tên>." The
  note from 19/11 is deleted, and the reply says so.
- Send a question on its own, for example "Tháng này có bao nhiêu giấy tờ?".
  It is answered as today, a few seconds later at most.
- Known trade-off, stated in the README: a question sent less than 5 seconds
  before a sheet is treated as the sheet's caption and is not answered on its
  own.

Steps, for the developer (local):

- Process the same caption and sheet events twice (simulated retry). The
  caption is linked once, to the same sheet. A second sheet sent right after
  gets no caption.

### Bug and root cause

Bug: An admin sent a sheet with a caption. The caption was saved as a
meaningless note on one driver. When the admin asked to fix it, the bot said it
could not.
Reproduce: send a text and then a sheet within a second. Then ask to delete
the note.

Root cause: Zalo sends the caption as its own `text` event before the `file`
event, and the text can be claimed before the file event is stored
(`claim-inbound-event.ts`), so it is answered alone. On the follow-up, the
model called `search_records` (a `MEMBER_TEXT_TOOLS` tool) before
`forget_member_fact`, so the change guard refused the delete.

### Solution

- Schema:
  - `inbound_events`: new column `caption_for_event_id` uuid, null, no default,
    foreign key to `inbound_events (id)`, on delete set null.
  - Unique index on (`caption_for_event_id`), where it is not null, built
    concurrently in its own migration, so one sheet has at most one caption.
  - `message_files`: new column `caption` text, null, no default, check
    `caption IS NULL OR char_length(caption) <= 1000`.
- Waiting for the sheet (`src/app/processing/`): when a claimed `text` event
  is from a current admin (`findIntakeSender`, role `admin`), has no photo,
  and its payload `sent_at` is less than 5 seconds ago (server time), it is
  postponed until `sent_at` + 5 seconds without spending an attempt (as
  `postpone-event.ts` does). Members' texts are not delayed.
- Linking, when that text is handled after the wait: find the earliest `file`
  event from the same sender (channel, account, Zalo user) whose payload
  `sent_at` is after the text's and at most 5 seconds later, and that has no
  caption yet. If one exists, in the same transaction that finishes the text
  event:
  - store the text as a message as today;
  - set the text event's `caption_for_event_id` to that file event;
  - log `[intake] text <id> used as caption of file <id>`;
  - send no reply for the text.
  - A retry reads the stored link and never matches again. When no file
    matches, the text is handled as today.
- The file side (`receive-file.ts`): when storing the sheet, read the caption
  from the text event linked to this file event, and store it in
  `message_files.caption`. The parse and process workers select it, and
  `SheetReaderInput` and `sheet-reader-prompt.ts` take it.
- Reading with a caption (`sheet-reader-prompt.ts`): the caption is placed in
  its own delimited block, described as text the admin sent with the file. It
  is untrusted data that may only hint at what the sheet is and what its
  columns mean. Any instruction in it to act, disclose or change behavior is
  ignored, like instructions in file names and cells. The result reply says
  the caption was used ("Đã đọc theo ghi chú kèm file") without quoting it.
- Reuse: the sender and time query follows `find-recent-messages.ts`, and the
  untrusted-text formatting follows the photo reread. The link is forward and
  consuming, which the photo code is not.
- Admin prompt (`src/app/admin-chat/admin-prompt.ts`):
  - Before a change tool, call no `MEMBER_TEXT_TOOLS` tool (searches, totals,
    document lists). Lookups such as `list_members`, `list_member_facts`,
    `list_facts` and `list_scheduled_tasks` may come first.
  - Save a note or fact only for a self-contained, lasting statement about an
    identified member, truck or route. Never for an announcement, an intention,
    a placeholder, or a statement about a file or data that did not arrive.
    Then say the file was not received.
  - When the guard refuses a change, do not claim a different reason. The
    system's notice already says which change was not done.
- README: the caption window, its trade-off, and the replies.

Tests: none (see the shared facts above).

### Revert cost

Captions are answered on their own again, and admin texts are not delayed.
The new columns stay, unused.
