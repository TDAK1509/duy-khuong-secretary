# Admin reports and scheduled reports run on gpt-6.1-sol

PR 1 merges first. PR 2 and PR 3 each depend only on PR 1 and can merge in
either order. Each PR leaves production working when it ships alone.

Facts every PR in this file relies on:

- The bot talks to OpenAI in two ways. **Reading** (photos, texts, sheets) asks
  for an answer that fills a JSON form, with no tools
  (`src/providers/reading/`). **Chat** (admin chat, member chat, scheduled
  runs) gives the model a list of **tools**, which are functions in our code
  such as `total_document_numbers` or `list_documents`. The model asks for a
  tool, our server runs it, sends the result back, and repeats until the model
  writes the answer. Each pass is one round: up to 15 for the admin chat, 5 for
the member chat and scheduled runs. That loop is
  `src/app/admin-chat/run-tool-loop.ts`, and it talks only to the `ChatService`
  interface in `src/services/chat/chat-service.ts`.
- Chat calls go through `src/providers/chat/openai-compatible-chat.ts`, which
  uses OpenAI's **Chat Completions API** (`chat.completions.create`). It sends
  the tool list whenever the request has tools, which every chat path does.
- **Why `gpt-6.1-sol` failed in production.** OpenAI does not support tool
  calling on `gpt-6.1-sol` through Chat Completions. Tool calling on that
  model needs the **Responses API** (`/v1/responses`). `gpt-6.1-sol` also
  rejects the reasoning effort `none`. On 17/11/2026 at 09:05 the admin chat ran
  on `gpt-6.1-sol` with `medium`, and the first call failed after 0.65 s
  (`[admin-chat] … outcome=chat_failed rounds=0`). Commit #147 moved the admin
  chat and scheduled runs back to `gpt-6-luna` with `none`. Reading works on
  `gpt-6.1-sol` because it sends no tools.
- Each chat task already has its own model setting
  (`src/bootstrap/chat-config.ts`): `ADMIN_CHAT_*`, `MEMBER_CHAT_*` and
  `SCHEDULED_RUN_*`, each falling back to `LLM_MODEL` and
  `LLM_REASONING_EFFORT`. A model must have a price in
  `src/app/credits/price-call.ts`, or the start fails.
- Every LLM call is a row in `llm_calls` (kind, model, tokens, cost, credits),
  priced from the token counts the API returns.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check.
- psql access to production is described in the README section "SQL from a
  local terminal".

---

## PR 1: All chat calls go through OpenAI's Responses API

### The mindset of this PR

- Goal: The admin chat, member chat and scheduled runs reach OpenAI through
  the Responses API. Everything works exactly as today on `gpt-6-luna`, and a
  chat task set to `gpt-6.1-sol` with `medium` can now use tools.
- What matters most: 1. Every chat answer that works today still works, with
  the same tools and the same results. 2. No conversation is stored on
  OpenAI's side. 3. Every call is still priced with correct token counts,
  including cached and reasoning tokens.
- Out of scope: Moving any task to `gpt-6.1-sol` in `render.yaml`. The reader,
  which stays on Chat Completions. Any prompt or tool change.

### Outcome

Brief: Chat calls use OpenAI's Responses API instead of Chat Completions.
Nothing changes for drivers and admins, and `gpt-6.1-sol` can now run the
admin chat with tools.

Before: Setting `ADMIN_CHAT_MODEL=gpt-6.1-sol` with `medium` makes every admin
message fail with "Xin lỗi, hệ thống đang bận. Bạn gửi lại sau ít phút nhé."
After: The same setting gives normal admin answers that use tools. With the
production settings (`gpt-6-luna`, `none`) every chat answers as before.

Steps:

- Deploy. As an admin in Zalo, ask "Tháng này đã lưu bao nhiêu giấy tờ?". The
  answer arrives, and the log line `[admin-chat] … outcome=answered` shows at
  least one tool call.
- As a driver, send "Hôm nay tôi gửi gì?". The answer arrives.
- As an admin, send "Đặt lịch một lần sau 2 phút: tóm tắt các giấy tờ đã lưu
  hôm nay theo từng xe." After the next scheduler tick (every 60 seconds), a
  message headed `Lịch "<title>":` arrives with the summary.
- In psql, the newest `llm_calls` rows of kind `chat_answer` have
  `input_tokens`, `output_tokens` and `cost_usd` above 0.
- In the Render dashboard, set `ADMIN_CHAT_MODEL=gpt-6.1-sol` and
  `ADMIN_CHAT_REASONING_EFFORT=medium`. Ask the same admin question. The
  answer arrives, no `[chat] … failed` line appears, and the newest
  `chat_answer` row has model `gpt-6.1-sol`.
- Set both values back to `gpt-6-luna` and `none`.

### Solution

- Chat provider (`src/providers/chat/openai-compatible-chat.ts`)
  - Before: `chat.completions.create` with `messages`, `tools` and
    `reasoning_effort`.
  - After: the Responses API (`responses.create`) with the same system
    prompt, the same turns, the same tools (strict function tools) and
    `reasoning: { effort }` when an effort is set.
  - Tools use the Responses API function-tool shape, still strict. The tool
    schemas are already strict-valid today, because Chat Completions sends them
    with `strict: true`.
  - Turns map to Responses API input items: user and assistant text become
    messages; an assistant's tool calls become function call items; tool
    results become function call output items with the same call id.
  - Send `store: false`. The server keeps the conversation, as today.
  - Reasoning carried between rounds
    - Before: a turn holds only text, tool calls or tool results.
    - After: during one tool loop, the output items a reasoning model returns
      with its tool calls (its reasoning items included) are sent back
      unchanged, in order, before the tool results of the next round. With
      `store: false`, request the encrypted reasoning content so these items
      can be sent back. Do not rely on `previous_response_id`. History loaded
      from the database stays text only, as today.
  - Reading the reply: walk the response's output items in order. When there
    is at least one function call, the reply is every function call, in order,
    as today. Otherwise the reply is the output text.
- Token usage
  - Before: `readTokenUsage` (`src/services/usage/read-token-usage.ts`) reads
    the Chat Completions shape (`prompt_tokens`, `completion_tokens`, …).
  - After: a separate mapping reads the Responses API shape (`input_tokens`,
    `input_tokens_details.cached_tokens`, `output_tokens`,
    `output_tokens_details.reasoning_tokens`) into the same `TokenUsage`, with 0
    for an absent field and 0 cache-write tokens, since the Responses API
    reports none. The reader keeps the existing Chat Completions mapping.
- Timeouts and failure logging (`[chat] model=… failed status=… message=…`)
  behave as today.
- README, "Admins ask the bot": chat calls use the Responses API. Replace the
  note that `gpt-6.1-sol` with `medium` failed with tools, and the note that
  `gpt-6-luna` supports function calling only with `none`, with one line:
  chat calls use the Responses API. The supported production settings are
  `gpt-6-luna` with `none` and `gpt-6.1-sol` with `medium`.

Tests: none (see the shared facts above).

### Revert cost

Chat goes back to Chat Completions. Nothing breaks while every chat task stays
on `gpt-6-luna`.

---

## PR 2: Scheduled reports run on gpt-6.1-sol with medium reasoning

Depends on: PR 1.

### The mindset of this PR

- Goal: Scheduled tasks, which are almost always reports, run on
  `gpt-6.1-sol` with `medium` reasoning.
- What matters most: 1. Every scheduled run still delivers its result.
  2. Its cost is recorded with model `gpt-6.1-sol`.
- Out of scope: The admin chat. Scheduled task creation or timing.

### Outcome

Brief: `render.yaml` sets the scheduled runs to `gpt-6.1-sol` with `medium`.

Before: Scheduled runs use `gpt-6-luna` with `none`.
After: Scheduled runs use `gpt-6.1-sol` with `medium`. A run costs about
$0.05 instead of about $0.002.

Steps:

- Deploy. As an admin, send "Đặt lịch một lần sau 2 phút: tóm tắt các giấy tờ
  đã lưu hôm nay theo từng xe."
- After the next scheduler tick (every 60 seconds, at most 5 tasks per tick),
  a message headed `Lịch "<title>":` arrives with the summary.
- In psql, the newest `llm_calls` row of kind `scheduled_run` has model
  `gpt-6.1-sol`.
- No `[chat] … failed` line appears in the logs for that run.

### Solution

- `render.yaml`: `SCHEDULED_RUN_MODEL` = `gpt-6.1-sol`,
  `SCHEDULED_RUN_REASONING_EFFORT` = `medium`.
- README, scheduled runs row of the "Admins ask the bot" table: production
  value is `gpt-6.1-sol` with `medium`.

Tests: none (see the shared facts above).

### Revert cost

Scheduled runs go back to `gpt-6-luna`. Nothing else changes.

---

## PR 3: Admin report requests are answered on gpt-6.1-sol

Depends on: PR 1.

### The mindset of this PR

- Goal: When an admin asks for a report, analysis, comparison or total over
  saved data, the answer runs on `gpt-6.1-sol` with `medium` reasoning. Every
  other admin message (saving facts, invites, members, schedules, greetings,
  single lookups) stays on `gpt-6-luna`.
- What matters most: 1. Report requests reach `gpt-6.1-sol`, including
  follow-ups such as "còn tháng 10 thì sao?" after a report. 2. When the
  label call fails, the admin still gets an answer. 3. Every label is logged,
  so wrong labels can be found and the label prompt tuned.
- Out of scope: Member chat. Scheduled runs. Changing the admin prompt,
  tools, guard or round limit. Photo messages, which go through the reader
  first as today.

### Outcome

Brief: Before answering an admin, a short `gpt-6-luna` call with no tools
labels the message `report` or `other`. A `report` is answered on
`gpt-6.1-sol` with `medium`. An `other` is answered on `gpt-6-luna`, as today.

Before: Every admin message is answered on `gpt-6-luna` with no reasoning,
including multi-step reports, which come back shallow or hit the round limit.
After: "So sánh tổng trọng lượng từng công ty tháng 10 và tháng 11" is
answered on `gpt-6.1-sol`. "Mời tài xế Tuấn vào nhóm" is answered on
`gpt-6-luna`.

Steps:

- Deploy. As an admin, send "So sánh tổng trọng lượng hàng giao cho từng công
  ty trong tháng 10 và tháng 11."
- The log shows `[admin-route] message=<id> label=report`, and the newest
  `chat_answer` row in `llm_calls` with model `gpt-6.1-sol` was written for
  this answer.
- Send "Còn theo từng xe thì sao?". The log shows `label=report`.
- Send "Chào bạn". The log shows `label=other`, and the answer's
  `chat_answer` rows have model `gpt-6-luna`.
- Send "Mời tài xế Tuấn vào nhóm với vai trò thành viên." The log shows
  `label=other`, and the invite is created on `gpt-6-luna` as today.

### Solution

- New: before an admin chat turn, one call to the admin chat service
  (`gpt-6-luna` in production) with no tools. Its input is a short labelling
  prompt plus the admin's message and the last 6 turns of the conversation.
  It returns `report` or `other`.
  - The prompt defines `report`: reports, analysis, comparisons, rankings,
    totals or summaries over a period, several trucks, drivers or companies,
    and follow-ups to such a request. `other`: greetings, saving, changing or
    removing facts, invites, members, schedules, memory, and single lookups
    such as "ảnh phiếu cân hôm qua của xe 93C04939". Give a few Vietnamese
    examples of each.
  - The call records an `llm_calls` row of kind `chat_answer`, like every
    other call of the answer.
  - Log one line per admin message:
    `[admin-route] message=<id> label=report|other|failed`.
  - A failed or unclear label call counts as `other`. No user action can make
    the label call fail on purpose. A reviewer checks this path in the code,
    and production shows it as `label=failed` in the logs.
  - Label once per admin message, in `produceAnswer`, before the first chat
    turn. The label call uses the same loaded history as that first turn. The
    retry with hidden earlier answers reuses the same label and the same
    model. The label never changes the guard or the retry.
- Model choice (`chooseToolLoop` in `src/app/admin-chat/answer-with-chat.ts`)
  - Before: an admin always gets the admin chat service.
  - After: a `report` label gets a new admin report service. An `other` label
    gets the admin chat service. Tools, prompt, guard and round limit are the
    same for both.
- Configuration: follow the task settings in `src/bootstrap/chat-config.ts`.
  Add an admin report task (model and reasoning effort) that falls back to
  `LLM_MODEL` and `LLM_REASONING_EFFORT` like the others. Add it everywhere
  the chat tasks are listed: the `ChatServices` type
  (`src/services/chat/chat-service.ts`), `buildChatServices`
  (`src/bootstrap/from-env.ts`), `IntakeChats`
  (`src/app/intake/intake-context.ts`) and the intake metering
  (`src/app/intake/receive-intake.ts`). The label call, every tool round of
  the answer and a possible retry are all metered as `chat_answer`.
- `render.yaml`: the admin report task = `gpt-6.1-sol` with `medium`. The admin
  chat stays `gpt-6-luna` with `none`.
- README, "Admins ask the bot": describe the label call, the two admin models,
  the new variables and the `[admin-route]` log line.

Tests: none (see the shared facts above).

### Revert cost

Every admin message goes back to `gpt-6-luna`. Nothing else changes.
