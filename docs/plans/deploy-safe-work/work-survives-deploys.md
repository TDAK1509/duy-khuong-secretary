# Work in progress survives a deploy

These PRs merge in the order written. Each one leaves production working when
it ships alone.

Facts every PR in this file relies on:

- Production runs on Render (service `duy-khuong-secretary`, workspace
  "cothuky"). On a deploy, Render starts the new instance, switches traffic to
  it, and some time later sends `SIGTERM` to the old instance. From then, the
  old instance has `maxShutdownDelaySeconds` (30 when unset, at most 300) to
  exit. If it is still alive at the end, Render kills it. `render.yaml` does
  not set the delay today. **Both instances run at the same time** until the
  old one exits, and both poll the same database queues.
- The Docker image starts `node dist/bootstrap/main.js` directly, so Node
  receives `SIGTERM`. Today `src/bootstrap/main.ts` then stops the 60-second
  ticker interval, waits up to 25 seconds for the inbound and outbound queue
  workers, and closes the HTTP server and the database pool. Steps still
  running at that point keep running against a closed pool until Render kills
  the process.
- **Inbound events** (every Zalo message: reading, saving, admin answers and
  reports) are rows in `inbound_events`. A claim
  (`src/app/processing/claim-inbound-event.ts`) sets `processing`,
  `locked_until` 5 minutes ahead (never renewed) and `attempts + 1`. Work runs
  in stages that are skipped when already done
  (`src/app/processing/stages.ts`).
- **Which writes check the claim.** Writes made through those stages use
  `runInClaimedTransaction` (`src/app/processing/claimed-transaction.ts`),
  which requires `status = 'processing'` and the same `attempts`. Otherwise it
  fails with `ClaimLostError` and writes nothing. The check does not look at
  `locked_until`. Model calls and the direct writes of admin tools (for
  example `create_invite`) do not go through it.
- **Attempts.** A failed event is requeued after 30 s, 60 s, 120 s, … and is
  failed after 5 attempts. A claim that pushes `attempts` above 5 marks the
  event failed (`LockExpired`) without handling it
  (`src/app/processing/record-failure.ts`, `inbound-step.ts`).
- **Scheduled runs** happen inside the ticker (`src/app/ticker/run-tick.ts`:
  Zalo connection renewal, then `runDueTasks`, then photo cleanup). The
  interval starts a tick every 60 seconds even when the last one has not
  finished, so ticks can overlap. `runDueTasks` claims up to 5 due tasks one
  after another, each with `locked_until` 10 minutes ahead
  (`src/app/scheduled-runs/claim-due-task.ts`). The finish
  (`finish-scheduled-run.ts`, `ownsClaim`) proceeds only when the task is
  active and `next_run_at` still equals the claimed value, so one occurrence
  is delivered at most once.
- **What happens today when a deploy hits work in progress.** An admin report on
  `gpt-6.1-sol` takes from 30 seconds to several minutes. After 25 seconds the
  old instance closes its pool, and Render kills it at 30 seconds. The event
  stays `processing` until its 5-minute lock passes. The new instance then runs
  it again from the first unfinished stage, using one more attempt. The admin
  waits up to 5 minutes, and the model calls are paid twice. A scheduled run is
  not waited for: it is killed, and runs again after its 10-minute lock.
- **Outgoing messages** (`outbound_messages`, one send at a time, a lock of 2
  minutes) are out of scope. Their worker keeps today's behavior: shutdown
  lets the send in progress finish and claims no new one. A send cut off
  mid-way becomes `unknown` and is never resent, by design.
- The process exits as soon as shutdown is done, so any work still running in
  it stops at that point.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check. Merging to `main` deploys.

---

## PR 1: A message in progress during a deploy is answered once, without waiting for its lock

### The mindset of this PR

- Goal: A Zalo message being handled when the old instance gets `SIGTERM` is
  answered once. Either the old instance finishes it, or the old instance
  hands it back before exiting and the new instance can claim it at once.
- What matters most: 1. No message is lost, including one on its 5th attempt,
  and none is answered twice. 2. The new instance never starts a message the
  old one is still working on. 3. A deploy with nothing in progress shuts down
  as fast as today.
- Out of scope: Scheduled runs (PR 2). Outgoing messages. Making answers
  faster. Saving a model run's progress part-way through. Undoing an admin
  tool action that a cut-off run already made: the rerun can repeat it, as a
  crash can today.

### Outcome

Brief: On `SIGTERM`, the old instance stops claiming messages, extends the
locks of the ones it holds, and keeps working for up to about 4.5 minutes. A
message still unfinished then is handed back without using up an attempt, and
the old instance exits.

Before: An admin asks for a report and a deploy reaches the old instance mid-
answer. The old instance gives up after 25 seconds. The admin gets the answer
about 5 minutes later, and the report's model calls are paid twice.
After: The old instance finishes the report and the admin gets it once, on
time. A message that needs longer than the window is handed back, and the new
instance claims it within seconds.

Steps:

- Choose Manual Deploy, Deploy latest commit in the Render dashboard for
  `duy-khuong-secretary`. Note the old instance id from its logs (the
  `instance` label).
- While the deploy runs, as an admin in Zalo, send a report question such as
  "So sánh tổng trọng lượng hàng giao cho từng công ty trong tháng 10 và tháng
  11." every 20 seconds, until the old instance's logs show
  `[shutdown] started in_progress=<n>` with `n` above 0. The timing depends on
  when Render sends `SIGTERM`, so it can take a few tries.
- Each question gets exactly one answer in Zalo.
- The old instance's logs show `[inbound] event=<id> done` for the events it
  held, then `[shutdown] finished handed_back=0`.
- Deploy again with no message in progress. The old instance's logs show
  `[shutdown] started in_progress=0` and `[shutdown] finished handed_back=0`
  within a few seconds.
- The hand-back path runs only when one message needs more than about 4.5
  minutes, which nobody can cause on purpose. A reviewer checks it in the code.
  In production it shows as `[shutdown] handed back event=<id>` on the old
  instance, then `[inbound] event=<id> done` on the new one.

### Solution

- `render.yaml`: set `maxShutdownDelaySeconds` to 300 on the web service.
- Schema:
  - `inbound_events`: new column `claim_token` uuid, null, no default. Each
    claim sets a new random value. A hand-back sets it to null.
- Claim check
  - Before: `runInClaimedTransaction` requires `status = 'processing'` and the
    same `attempts`.
  - After: it requires `status = 'processing'` and the same `claim_token`. The
    claim returns the token with the event.
- New: inbound processing (`src/app/processing/inbound-step.ts`) keeps a
  registry of the events this instance holds: added after a claim, removed in
  a `finally` once handling ends. The generic queue worker stays unaware of
  events. Bootstrap creates the registry and passes it in.
- New: after each event is handled, log `[inbound] event=<id> done`, once its
  last stage has committed.
- Shutdown (`src/bootstrap/main.ts`), in this order, under one deadline of 270
  seconds from `SIGTERM`:
  - Close the HTTP server and stop both queue workers from claiming. Log
    `[shutdown] started in_progress=<number of held events>`.
  - Extend `locked_until` of every held event to the deadline plus 30 seconds,
    matching its id and `claim_token`. This stops the new instance from
    claiming them while the old instance still works on them.
  - Wait until the workers are idle or the deadline passes.
  - Hand back every event still held, in one statement: `status = 'queued'`,
    `available_at` = now, `locked_until` = null, `claim_token` = null,
    `attempts = attempts - 1`, `last_error = 'shutdown'`, matching id and
    `claim_token`. Lowering `attempts` keeps the hand-back from using up a
    retry. The token, not `attempts`, keeps the old instance's late writes out.
    Log `[shutdown] handed back event=<id>` for each one.
  - Close the pool, log `[shutdown] finished handed_back=<n>` and exit. A
    failed extend or hand-back is logged, and that event falls back to today's
    lock-expiry retry.
- README, "Deploy to Render": describe the shutdown window, the hand-back and
  the log lines.

Tests: none (see the shared facts above).

### Revert cost

Shutdown goes back to the 25-second wait, and work in progress restarts after
its 5-minute lock. The `claim_token` column stays and is unused.

---

## PR 2: A scheduled run in progress during a deploy is delivered once, without waiting for its lock

Depends on: PR 1.

### The mindset of this PR

- Goal: A scheduled task running when the old instance gets `SIGTERM`
  delivers its result once. The old instance finishes it, or hands it back
  so the new instance can run it on its next tick.
- What matters most: 1. The result is delivered exactly once. 2. After a
  hand-back, the old instance can no longer finish the run. 3. Shutdown never
  starts new ticker work.
- Out of scope: Inbound messages (PR 1). Changing what renewal and photo
  cleanup do. Their in-progress work is only waited for.

### Outcome

Brief: Shutdown also stops the ticker from starting new work and waits for
every tick in progress, inside PR 1's window. A scheduled task still
unfinished at the end is handed back, and the old instance can no longer
deliver it.

Before: A scheduled report is running when the old instance gets `SIGTERM`.
The old instance does not wait for it, and it is killed. The result arrives
about 10 minutes later.
After: The old instance finishes the run, and the result arrives on time. A
run that cannot finish in the window is handed back, and the new instance can
run it on its next tick, behind any earlier due tasks.

Steps:

- Choose Manual Deploy, Deploy latest commit in the Render dashboard. Note the
  old instance id.
- As an admin, send "Đặt lịch một lần sau 2 phút: tóm tắt các giấy tờ đã lưu
  hôm nay theo từng xe." Repeat with new tasks until the old instance's logs
  show `[scheduled-run] started task=<id>` and then `[shutdown] started` before
  that task's result. The timing depends on Render, so it can take a few tries.
- One message headed `Lịch "<title>":` arrives for each task. None arrives
  twice.
- The old instance's logs show `[scheduled-run] finished task=<id>`, then
  `[shutdown] finished handed_back=0`.
- The hand-back path needs a run longer than the window and cannot be caused
  on purpose. A reviewer checks it in the code. In production it shows as
  `[shutdown] handed back task=<id>` on the old instance, then
  `[scheduled-run] started task=<id>` on the new one.

### Solution

- Ticker (`src/bootstrap/main.ts`, `src/app/ticker/run-tick.ts`)
  - Before: a new tick starts every 60 seconds, even while the last one runs,
    and shutdown only stops the interval.
  - After: a tick does not start while another is running. Shutdown stops the
    interval, and a tick in progress starts no further job (renewal, scheduled
    runs, photo cleanup) once shutdown has begun. Shutdown waits for the tick
    in progress inside PR 1's deadline.
- `runDueTasks` (`src/app/scheduled-runs/run-due-tasks.ts`) checks for shutdown
  before every claim and claims no task after it begins.
- Claim fence for scheduled runs
  - Before: `ClaimedTask` carries `claimedNextRunAt`, and `ownsClaim` checks
    id, `active` and `next_run_at`.
  - After: `ClaimedTask` also carries the `locked_until` its claim set.
    `ownsClaim` also requires that exact `locked_until`, so a handed-back run
    can no longer finish.
- New: `runDueTasks` keeps the tasks it holds (added after the claim, removed
  in a `finally`), so shutdown knows which to hand back.
- New: at the deadline, set `locked_until` to null for every task still held,
  matching id and the claimed `locked_until`. Log
  `[shutdown] handed back task=<id>`, and count it in
  `[shutdown] finished handed_back=<n>`.
- New log lines: `[scheduled-run] started task=<id>` after a claim and
  `[scheduled-run] finished task=<id>` after the finish commits. The scheduled
  runs log nothing today.
- README, "Scheduled runs and delivery": replace "A crash leaves the lock to
  expire and the task runs again once" with the deploy behavior. Keep the
  crash case.

Tests: none (see the shared facts above).

### Revert cost

Scheduled runs go back to being cut off by a deploy and rerunning after their
10-minute lock. Ticks can overlap again.
