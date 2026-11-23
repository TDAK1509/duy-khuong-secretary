# New R2 objects are filed by workspace, date and user

## The mindset of this PR

- Goal: Every object the app writes to R2 from now on has the key
  `workspaces/<workspace_id>/<YYYYMMDD>/<user_id>/<object id>.<extension>`,
  so the owner can browse a company's objects by day and by person.
- What matters most: 1. Every photo, sheet and export stays readable: objects
  saved before this PR keep working. 2. A retried intake step reuses the key it
  stored, never a second key. 3. The date is the Vietnam date the person sent
  the photo or sheet, or the date the export was made.
- Out of scope: Moving or renaming objects saved before this PR (old photos
  age out through the 180-day cleanup; old sheets and exports keep their
  keys). Bucket lifecycle rules. Another bucket. Excel exports from scheduled
  runs (they offer no export tool today).

## Outcome

Brief: The three places that build R2 keys use one shared key builder. Photo
and sheet keys use the sender's user id and the date it was sent. Excel export
keys use the admin who asked for the export and the export date.

Before: A driver's photo is stored as `<workspace_id>/<message id>.jpg`, an
admin's sheet as `<workspace_id>/<message id>.xlsx`, and an Excel export as
`workspace_<workspace_id>/exports/<id>.xlsx`.
After: A driver's photo sent on 23/11/2026 is stored as
`workspaces/<workspace_id>/20261123/<driver user id>/<message id>.jpg`. Sheets
and exports follow the same layout.

Steps, for the owner (after deploy):

- In Zalo, as a driver, send a photo. In the Cloudflare R2 dashboard, open
  bucket `secretary-photos`, folder `workspaces/<workspace id>/<today>/`. A
  folder named with the driver's user id holds the photo.
- As an admin, send a small `.xlsx` sheet. It appears under today's folder and
  the admin's user id.
- Ask for an Excel report. The link opens the file, and the file sits under
  today's folder and the admin's user id.
- Ask "gửi lại ảnh phiếu cân hôm qua của xe <biển số>" for a paper saved before
  the deploy. The old photo comes back as usual.

Steps, for the developer (before merging, local):

- Send a photo and a sheet to a local instance with a local S3 store (MinIO).
  Check the keys in `messages.image_key` and `message_files.file_key`.
- Set a debugger breakpoint on the photo upload (`put` in `receive-photo.ts`),
  send a photo, and kill the process at the breakpoint. Set the event's
  `locked_until` in the past, restart, and let the event be claimed again. The
  object lands at the key stored on the message, and there is one object.
- Do the same with a breakpoint after the sheet upload, before its row is
  stored. The retry writes the same key, and there is one object.
- Send a photo whose `sent_at` is 23:59 Vietnam time on one day. Its folder is
  that day, not the next.

## Solution

- New: one key builder in `src/app/` storage code, used by every writer. It
  takes the workspace id, the user id, a time, the object id and the
  extension. The date is that time's Vietnam date (`Asia/Ho_Chi_Minh`),
  `YYYYMMDD`, built from the year, month and day parts (the existing
  `formatVietnamDate` gives `DD/MM/YYYY`, which does not fit).
- The time for intake objects is the event's `sent_at` (`readSentAt`,
  `src/app/processing/claimed-event.ts`), the same on every retry.
- Photos (`src/app/intake/receive-photo.ts`, `storeMessageAndPhoto`):
  - Before: `<workspace_id>/<id>.<ext>`.
  - After: the builder, with the sender's user id and the event's `sent_at`.
    A retry keeps using the key stored on the message, as today.
- Sheets (`src/app/intake/receive-file.ts`, the file target):
  - Before: `<workspace_id>/<message id>.<ext>`.
  - After: the builder, with the sender's user id and the event's `sent_at`.
    The object id is the inbound event's id, not a new random id: the bytes are
    uploaded before the row is stored, so a retry after a crash in between
    writes the same key instead of a second object. A retry after the row is
    stored keeps using `message_files.file_key`, as today.
- Excel exports (`src/app/admin-chat/tools/store-excel-export.ts`, called by
  `export_report_xlsx`, `export_trip_report_xlsx`, `export_documents_xlsx`):
  - Before: `workspace_<workspace_id>/exports/<id>.xlsx`.
  - After: the builder, with the scope's user id (the admin in chat) and the
    clock's now.
- Readers, cleanup and outbound photos are unchanged: they read the key stored
  on each row (`messages.image_key`, `message_files.file_key`,
  `outbound_messages.photo_key`), so old and new keys both work.
- README, the storage part: the layout, the date rule, and that older objects
  keep their old keys (old photos until the 180-day cleanup; old sheets and
  exports until removed by hand).

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

New objects go back to the old keys. Objects saved in the meantime keep their
new keys and stay readable, because every reader uses the stored key.
