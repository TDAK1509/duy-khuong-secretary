# Admin sheets are parsed and read in production

## The mindset of this PR

- Goal: After an admin's sheet is received ("Đã nhận file"), the server parses
  it, replies with its headers, has the sheet reader save its rows (with the
  caption as a hint) and replies with the result. Each sheet's documents and
  replies are committed exactly once, even with two instances running during a
  deploy.
- What matters most: 1. No sheet saves its rows twice or sends a reply twice,
  and none is stuck forever. 2. Every sheet ends with a reply, unless its admin
  has been removed. 3. Deploys hand unfinished sheets back, like inbound
  messages.
- Out of scope: What the sheet reader saves from a sheet. Merging the replies.
  New file types. Retrying a reader failure: it stays one final reply, as
  today.

## Outcome

Brief: The two existing sheet steps, parse and process, run as queue workers
next to the inbound and outbound workers. Each sheet is claimed with a lease
and a fresh token, so only one instance works on it. Process writes the
documents, its reply and `processed_at` in one fenced transaction. Unexpected
errors are retried, and the sheet is finished with a failure reply after 5
attempts. Shutdown extends and hands back leased sheets.

Before: `runParseFilesStep` and `runProcessFilesStep`
(`src/app/intake/run-parse-files-step.ts`, `run-process-files-step.ts`) exist
but nothing runs them. They ran only in integration tests, removed in fea17ba8.
An admin sheet gets "Đã nhận file" and nothing more. Production holds one
stored sheet from 19/11, never parsed.
After: A sheet gets its headers reply within seconds and its result reply
shortly after. Each reply quotes the admin's original file message. The 19/11
sheet is processed after the deploy, and its replies say they are for a file
sent earlier.

Steps, for the owner:

- Deploy. The 19/11 sheet is picked up by itself. Two replies arrive, quoting
  that file and saying it was sent earlier: the headers, then the result. Do
  not send it again.
- Send a new small sheet with a caption ("Bảng thử, biển số ở cột B"). The
  receipt, the headers reply and the result reply arrive, each quoting the
  file. The result says it read the sheet using the caption.
- Send a sheet with only a header row. One reply says there are no data rows,
  and no other reply follows for it.

Steps, for the developer (local, nothing committed):

- Run two service instances (different `PORT`s) against one local database and
  send one sheet. The headers reply and the result reply each come once, and
  the rows are saved once.
- Point the reader at an unreachable endpoint. The sheet gets the reader
  failure reply once and is finished. It is not retried.
- Make the process step throw before its final write (for example, stop the
  local database briefly). It retries with growing waits. After 5 attempts the
  admin gets the reader failure reply, and the log shows `[files] gave up`.
- Keep a sheet's processing alive past the shutdown deadline (a slow fake
  reader) and send SIGTERM. The log shows `[shutdown] handed back file=<id>`,
  and the other instance finishes the sheet. With normal timing the sheet
  simply finishes during shutdown.

## Bug and root cause

Bug: An admin sends a sheet. The bot replies "Đã nhận file" and never replies
again. The rows are never saved.
Reproduce: send any `.xlsx` as an admin.

Root cause: the two sheet steps are never called. `src/bootstrap/main.ts`
starts only the inbound and outbound workers and the ticker, and
`buildQueueSteps` (`src/bootstrap/assemble-service.ts`) builds no sheet steps.
The steps also pick a sheet with a plain `SELECT … LIMIT 1` and no claim, so
two instances would process the same sheet. Process commits its documents and
its reply in two transactions, so a crash between them leaves a sheet that can
never finish: the retry hits the unique source index.

## Solution

- Schema, `message_files`, three migrations:
  - First (locked with `lockTables(pgm, ['message_files'])`): new columns
    `claim_token` uuid, null; `locked_until` timestamptz, null; `attempts`
    smallint, not null, default 0; `last_error` text, null. A named check
    `char_length(last_error) <= 200`, added `NOT VALID`. Error text is cut to
    200 characters before it is written.
  - Second (locked): validate that check.
  - Third (no transaction): concurrent index on (`created_at`) where
    `processed_at IS NULL`.
- Claiming (both steps), in one transaction:
  - An unscoped `SELECT … FOR UPDATE SKIP LOCKED` picks the oldest sheet in the
    step's state whose `locked_until` is empty or past. Parse picks
    `parsed_at IS NULL`. Process picks `parsed_at IS NOT NULL AND processed_at
    IS NULL`. Reads across workspaces are allowed by the policy
    (`0059_add_parsed_at_to_message_files.ts`).
  - Then, inside `withScope({ workspaceId })` (writes need the workspace), set
    a new random `claim_token`, `locked_until` = now + 5 minutes, and
    `attempts = attempts + 1`.
  - Every later write (lease extension, retry, success, give-up, hand-back) is
    scoped and matches id, `claim_token` and the step state. A write that
    matches nothing writes nothing and logs that the claim was lost.
- Parse outcomes:
  - Data rows found: queue the headers reply, set `parsed_at`, clear the token,
    lease and `attempts`. The sheet goes on to process.
  - Unreadable sheet, or no data rows (terminal): queue the existing parse
    reply, and set both `parsed_at` and `processed_at`. Process never sees it.
- Process outcomes:
  - It first computes everything without writing: parse the stored sheet, check
    credits, call the reader (recheck credits right before the call, and renew
    the lease before and after it), plan the mapping, build the documents and
    the reply text.
  - Then, in one scoped transaction: lock the sheet row by id and token, take
    the workspace lock (`lockWorkspaceRecords`), insert every document, queue
    the reply, and set `processed_at`, clearing the token and lease.
  - Out of credit, a mapping problem, or a reader failure that the reader
    returns as a value (timeout, unavailable, invalid output): terminal, one
    reply as today, `processed_at` set.
  - Reader calls are at least once: a crash after a reader call means a second
    call and a second charge. Only committed documents and queued replies are
    exactly once.
- Thrown errors (database, storage, bugs): release the lease with
  `locked_until` = now + 30 s × 2^(attempts − 1) and `last_error`, keeping the
  token cleared.
  - When `attempts` reaches 5, the next claim does only the give-up, fenced,
    until it commits: parse sends its failure reply and sets both timestamps,
    and process sends `SHEET_READER_FAILURE_TEXT` and sets `processed_at`.
    Exhausted sheets stay claimable until that commits. Log `[files] gave up
    file=<id> step=<parse|process> error=<name>`.
  - When the admin's membership is gone, the sheet is finished with no reply.
- Replies quote the admin's original file message
  (`inbound_events.external_event_id`, through `enqueueText`'s quote). When
  the file was received more than 30 minutes earlier, the reply starts with
  "Kết quả cho file gửi lúc <HH:mm dd/MM>:".
- Workers (`src/bootstrap/main.ts`, `assemble-service.ts`):
  - Two more queue workers, `files-parse` and `files-process`, concurrency 1
    each, with the 1-second poll pause (`pauseBeforeNextPoll`).
  - `files-parse` starts only when the `zalo` and `photos` (file storage)
    groups are on. `files-process` also needs the `readers` group. Otherwise
    log `[config] files-… is off; missing: <groups>`.
  - The sheet parser (`src/providers/sheets/exceljs-sheet-parser.ts`) is built
    in the bootstrap with the other providers.
- Shutdown (`src/bootstrap/main.ts`, like inbound events in
  `hand-back-events.ts`): a held-files registry (id, workspace, step, token)
  from `assembleService`. On SIGTERM both workers stop claiming. Each held lease
  is extended, matched by token, to the deadline plus the lock margin. The
  workers are awaited in the same window. At the deadline each still-held sheet
  is handed back, scoped and matched by token: token and lease cleared, and
  `attempts` decremented, so a deploy uses no attempt. Log `[shutdown] handed
  back file=<id>`.
- README, the file section: the two workers, their groups, retries, give-up,
  quoting and the shutdown hand-back.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

Sheets stop being parsed and read after the receipt, as before. The new columns
stay, unused.
