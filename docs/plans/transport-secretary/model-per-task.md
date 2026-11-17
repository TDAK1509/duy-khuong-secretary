# Each LLM task runs on the model chosen for it

## The mindset of this PR

- Goal: The operator sets the model and reasoning effort separately for the
  admin chat, the member chat and the scheduled runs. In production the admin
  chat and the scheduled runs use `gpt-6.1-sol` with medium reasoning, and the
  member chat stays on `gpt-6-luna` with no reasoning.
- What matters most: 1. Every LLM call is still priced and charged with the
  model that actually ran. 2. A host that sets only today's variables keeps
  working unchanged. 3. A model without a price still stops the start.
- Out of scope: The reader (it already has its own `READER_MODEL` and
  `READER_REASONING_EFFORT`). Choosing a model per question. Prompt or tool
  changes.

## Outcome

Brief: The admin chat, the member chat and the scheduled runs each read their
own model and reasoning setting. Production moves the admin chat and the
scheduled runs to `gpt-6.1-sol` with medium reasoning.

Before: One `LLM_MODEL` (`gpt-6-luna`) and one `LLM_REASONING_EFFORT` (`none`)
serve the admin chat, the member chat and the scheduled runs.
After: Each of the three tasks has its own model and reasoning setting. When
one is unset, that task falls back to `LLM_MODEL` and `LLM_REASONING_EFFORT`.

Steps:

- Deploy with the new `render.yaml`. The start log has no configuration error.
- As an admin in Zalo, ask "Tháng này đã lưu bao nhiêu giấy tờ?". The answer
  arrives. The service log line `[admin-chat] … outcome=answered` shows at
  least one tool call.
- In psql (see "SQL from a local terminal" in the README), the newest
  `llm_calls` row of kind `chat_answer` has model `gpt-6.1-sol`.
- As a driver, send a text with no work data, such as "Chào bạn". The newest
  `chat_answer` row for that workspace has model `gpt-6-luna`.
- Run a scheduled task (create a one-time task two minutes ahead). Its
  `scheduled_run` row has model `gpt-6.1-sol`.
- Locally, set the admin chat model to a name with no price, such as `gpt-x`,
  and start the service. It stops with `Invalid configuration: … "gpt-x" has
  no price`.

## Solution

- Follow the reader configuration in `src/bootstrap/reader-config.ts`: a task
  has its own model and reasoning variable, and the model must have a price
  in `src/app/credits/price-call.ts`.
- Chat configuration
  - Before: `src/bootstrap/chat-config.ts` reads one model and one reasoning
    effort, and `assemble-service.ts` builds one chat service shared by the
    three tasks.
  - After: three settings (admin chat, member chat, scheduled runs). Each one
    falls back to `LLM_MODEL` and `LLM_REASONING_EFFORT` when unset. One chat
    service is built per task. The base URL, key and timeout stay shared.
- The admin chat path (`answer-with-chat.ts` for an admin) uses the admin chat
  service. A member's chat uses the member service. `run-due-tasks.ts` uses
  the scheduled-run service.
- Metering (`src/app/credits/meter-chat.ts`) records the model of the service
  that actually answered.
- `render.yaml`: admin chat and scheduled runs set to `gpt-6.1-sol` with
  `medium`. Member chat keeps `gpt-6-luna` with `none`.
- README: add the new variables to the "Admins ask the bot" table, and remove
  the sentence saying that `gpt-6-luna` needs `none` for function calling
  from the admin chat row, keeping it for the member chat.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

All three tasks go back to `gpt-6-luna` with no reasoning. Nothing else
changes.
