# Photos are read on gpt-6.1-sol, texts and sheets on gpt-6-luna

## The mindset of this PR

- Goal: Uploaded photos are read on `gpt-6.1-sol` with `medium` reasoning.
  Text messages and uploaded sheets are read on `gpt-6-luna` with no
  reasoning, which costs about 15 times less per read.
- What matters most: 1. Photo reading quality stays exactly as today.
  2. Text and sheet reads still save the same work data. 3. Each read is
  recorded in `llm_calls` with the model that actually ran.
- If `gpt-6-luna` with `none` rejects the reader's strict JSON-schema answer on
  Chat Completions, stop and ask the owner before choosing another model or
  API.
- Out of scope: Chat calls (admin chat, member chat, scheduled runs). Moving
  the reader to the Responses API. Reader prompts or schemas.

## Outcome

Brief: The reader uses one model setting for photos and another for
everything without a photo. Production sets photos to `gpt-6.1-sol` with
`medium`, and the rest to `gpt-6-luna` with `none`.

Before: Every read uses `READER_MODEL` (`gpt-6.1-sol`) with
`READER_REASONING_EFFORT` (`medium`). In production a photo read costs about
$0.03 (6–10k input tokens, about 1.2k output tokens), and a text read with
about 4.5k input tokens costs about $0.01.
After: Photo reads are unchanged. Text and sheet reads run on `gpt-6-luna` at
about $0.0006 each.

Steps:

- Deploy. As a driver, send a photo of a weigh ticket. The bot replies
  "Đã lưu: …".
- In psql, the newest `llm_calls` row of kind `photo_read` has model
  `gpt-6.1-sol`.
- As a driver, send the text "Hôm nay giao 12 tấn bột đá cho Gạch Men Thạch
  Anh, xe 93C04939." The bot replies "Đã lưu: …".
- The newest `text_read` row has model `gpt-6-luna`.
- In the Zalo app's webhook settings, check that `user_send_file` is on (admin
  sheet uploads already need it; the README lists only text and image).
- As an admin, upload a `.xlsx` data sheet. The bot replies with the saved
  rows as today, and its `text_read` rows have model `gpt-6-luna`.
- Locally, set the photo reader model to a name with no price, such as
  `gpt-x`, and start the service. It stops with `Invalid configuration: …
  "gpt-x" has no price`.

## Solution

- Follow the per-task chat settings in `src/bootstrap/chat-config.ts`: each
  setting has a model and a reasoning effort, falls back to a shared default,
  and the model must have a price in `src/app/credits/price-call.ts`.
- Reader configuration (`src/bootstrap/reader-config.ts`)
  - Before: one `READER_MODEL` and one `READER_REASONING_EFFORT` for every
    read.
  - After: a photo setting and a text setting, each falling back to
    `READER_MODEL` and `READER_REASONING_EFFORT` when unset. Base URL, key and
    timeout stay shared.
- Reader shape
  - Before: one reader built from one config (`buildReader`,
    `src/bootstrap/assemble-service.ts`), exposing one `model`.
  - After: two readers, one per setting, behind one reader that sends each
    request to the photo reader when it carries an image and to the text reader
    otherwise. The assembled dependencies still pass one reader.
- Which setting a read uses: a read request that carries an image uses the
  photo setting. Every other read uses the text setting: text messages,
  sheets (`src/app/intake/read-sheet.ts`, `run-process-files-step.ts`),
  `backfill-detail-numbers`, and `reread-documents` for messages without a
  photo. `reread-documents` on a photo message uses the photo setting.
- Metering (`src/app/credits/meter-reader.ts`)
  - Before: records `reader.model`, one model for every read.
  - After: records the model of the reader that actually ran. A reread of a
    photo message records the photo model. A reread of a text message and
    `backfill-detail-numbers` record the text model.
- README, "Receive Zalo messages" and the Render checklist: add
  `user_send_file` to the webhook events to turn on.
- `render.yaml`: photo reads `gpt-6.1-sol` with `medium`. Text reads
  `gpt-6-luna` with `none`.
- README, "Save what the reader reads": add the two settings and their
  production values.

Tests: none. This repository adds no tests unless the owner asks for them. The
steps above are the check.

## Revert cost

All reads go back to `gpt-6.1-sol` with `medium`. Nothing else changes.
