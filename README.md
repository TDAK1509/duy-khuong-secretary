# Trợ lý

A Vietnamese Zalo chat assistant for truck companies. One TypeScript package (Node 24, npm).

## Run it locally

```sh
docker compose up -d --wait
npm ci
npm run build
DATABASE_URL=postgres://app_runtime:app_runtime@localhost:5432/secretary npm start
curl -i http://localhost:3000/health
```

`docker compose up` starts Postgres 17 with the database `secretary`, owned by the role `app_owner`. That role is not a superuser. It also creates the role `app_runtime`, which the service uses. Run the migrations as `app_owner` (see Migrations) before you start the service. If port 5432 is taken, set `POSTGRES_PORT` before `docker compose up` and use that port in `DATABASE_URL`.

| Env var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none, required | Postgres connection string of the runtime role `app_runtime` (see Row-level security) |
| `PORT` | `3000` | HTTP port |
| `GIT_COMMIT` | `RENDER_GIT_COMMIT`, else none | The deployed commit, shown by `/health` |
| `MIGRATION_DATABASE_URL` | none | Direct connection as the schema-owner role. Read only by `node dist/bootstrap/migrate.js` |

`GET /health` answers `200 {"ok":true,"commit":"<sha>"}` when the database answers, and `503 {"ok":false,"commit":"<sha>"}` when it does not. `commit` is `GIT_COMMIT`, else `RENDER_GIT_COMMIT`, else `null`.

## Create a workspace

The operator creates a workspace and the invite code of its first admin with one command (needs `DATABASE_URL`, and the migrations applied):

```sh
npm run build
DATABASE_URL=postgres://app_owner:app_owner@localhost:5432/secretary node dist/bootstrap/create-workspace.js "Xe tải Duy Khương" "Duy"
```

It prints `Workspace "<name>" created: <id>` and `First admin invite for <admin>: MOI-XXXXXX (valid until HH:mm dd/MM/yyyy)`. The code works once and for 7 days. Only its SHA-256 hash is stored, so the printed code is the only copy. Every run creates a new workspace. A name that is empty after trimming prints `Invalid workspace name.` or `Invalid admin name.` (exit 1) and creates nothing. On Render, run the same command in the service shell as `node dist/bootstrap/create-workspace.js "<workspace>" "<admin>"`.

## Connect the Zalo OA

The service talks to one shared Zalo Official Account. The operator connects it once:

```sh
npm run build
node dist/bootstrap/connect-zalo.js
```

It prints a link. Open it in a browser logged in to Zalo as an OA admin and approve. The browser shows `Zalo OA <oa id> connected.` and `channel_connections` holds one row for the OA with its keys encrypted (AES-256-GCM, `CHANNEL_TOKEN_ENCRYPTION_KEY`). On Render, run the same command in the service shell. Set the Zalo app's callback URL to `<PUBLIC_BASE_URL>/oauth/zalo/callback`.

Every 60 seconds the service renews each connection whose access key expires within 60 minutes. A rejected or unreachable renewal keeps the keys, alerts the operator and tries again on the next tick. A renewal that gets no answer may have spent the single-use renewal key: the connection becomes `reauthorization_required`, automatic renewal stops, and the operator is alerted. Run `connect-zalo` again before the access key expires (25 hours). The same alert text is sent at most once per hour per process.

The `zalo` feature group is on only when `MESSAGING_PROVIDER`, `ZALO_APP_ID`, `ZALO_APP_SECRET`, `CHANNEL_TOKEN_ENCRYPTION_KEY` and `PUBLIC_BASE_URL` are all set. While it is off the service logs `[config] zalo is off; missing: <NAMES>.`, the callback answers `503 Zalo is not configured.`, renewal is skipped, and `connect-zalo` prints `zalo is not configured: missing <NAMES>.` (exit 1).

| Env var | Default | Meaning |
|---|---|---|
| `MESSAGING_PROVIDER` | none | `zalo-oa` |
| `ZALO_APP_ID`, `ZALO_APP_SECRET` | none | The Zalo app's id and secret key |
| `ZALO_OAUTH_BASE_URL` | `https://oauth.zaloapp.com` | Zalo OAuth host |
| `ZALO_API_BASE_URL` | `https://openapi.zalo.me` | Zalo API host (sending messages) |
| `ZALO_TIMEOUT_MS` | `15000` | How long a Zalo API call may take before it counts as unanswered |
| `OUTBOUND_MAX_PER_MINUTE` | `90` | How many messages go out per minute (the Tăng trưởng package allows 100) |
| `CHANNEL_TOKEN_ENCRYPTION_KEY` | none | 64 hex characters (32 bytes) |
| `PUBLIC_BASE_URL` | none | Public URL of this service, for example `https://duy-khuong-secretary.onrender.com` |
| `ZALO_VERIFIER_FILE_NAME`, `ZALO_VERIFIER_FILE_CONTENT` | none | Both optional. When both are set, `GET /<file name>` returns the content as `text/html` (Zalo domain verification) |
| `ZALO_MEDIA_HOSTS` | `zdn.vn,zadn.vn` | Comma-separated hosts that photo downloads may use. A host matches when it equals an entry or ends with `.` plus an entry |
| `ZALO_OA_SECRET` | none | The OA secret key shown in the Zalo app's webhook settings; turns the webhook on |
| `ALERT_PROVIDER` | `log` | `log` writes alerts to the error log; `webhook` posts `{"text":"..."}` to `ALERT_WEBHOOK_URL` |
| `ALERT_WEBHOOK_URL` | none | Required when `ALERT_PROVIDER=webhook`; the start fails without it |

## Receive Zalo messages

`POST /webhooks/zalo` takes every event Zalo sends to the OA. In the Zalo app's webhook settings, set the URL to `<PUBLIC_BASE_URL>/webhooks/zalo` and turn on `user_send_text` and `user_send_image`. Set `ZALO_OA_SECRET` to the OA secret key shown there.

The route checks the `X-ZEvent-Signature` header (`mac=` and the hex SHA-256 of app id, exact raw body, `timestamp` and OA secret key) and that the body's `app_id` is `ZALO_APP_ID`. Answers:

| Status | When | Stored |
|---|---|---|
| `200 {"ok":true}` | A text or image message from a connected OA, a resent message, or any other event | One `queued` row in `inbound_events` for a new text or image message |
| `401 {"ok":false}` | The signature or the `app_id` is wrong | Nothing |
| `403 {"ok":false}` | The OA is not in `channel_connections` | Nothing |
| `500 {"ok":false}` | The connection check or the insert failed | Nothing; the operator gets `[alert] Zalo webhook could not store an event: <error name>.` |
| `503 {"ok":false}` | The `zalo-webhook` group is off: the `zalo` group plus `ZALO_OA_SECRET` | Nothing |

The service logs `[config] zalo-webhook is off; missing: <NAMES>.` while the group is off. The body limit is 1 MB. The background worker then marks each stored event `done`, in order per sender, and records the sender in `channel_identities`.

## Send Zalo replies

Replies wait in the `outbound_messages` table (one row per message, at most 2,000 characters each) and a background worker sends them to Zalo one at a time, in order per person. The worker does nothing while the `zalo` group is off. Everyone who writes to the OA gets the welcome text until joining with an invite code exists.

| Status | Meaning |
|---|---|
| `queued` | Waits for its turn or for a retry (`available_at`) |
| `sending` | Claimed by the worker (`locked_until` is 2 minutes ahead) |
| `sent` | Zalo accepted it |
| `failed` | Zalo refused it, or the retries ran out |
| `unknown` | The request may have reached Zalo but no answer came back. It is never sent again |

The worker sends at most `OUTBOUND_MAX_PER_MINUTE` messages in any 60 seconds (sent plus still sending). Zalo's rate-limit error waits 60 seconds and retries up to 10 attempts. A request that never left the server (connection refused, DNS failure) waits 30 s, 60 s, 120 s, ... and fails after 5 attempts. A missing OA connection waits 60 s and fails after 5 attempts. A `sending` row whose lock passed becomes `unknown`.

The operator gets `[alert] Zalo send got no answer for outbound message <id>. It will not be resent. Check the chat in OA Manager.` for each `unknown` message, `[alert] Outbound message <id> failed after <n> attempts.` when retries run out, and `[alert] No Zalo connection for OA <oa id>. Run connect-zalo.` while the OA has no stored keys. A row with `admin_membership_id` is sent only while that membership exists; otherwise it becomes `failed` (`membership_changed`).

## Store photos and texts

Everything a person in a workspace sends is stored in the `messages` table, in their chat of the workspace they chose. A photo is downloaded from Zalo at once and kept in the private bucket under `<workspace id>/<message id>.jpg` (or `.png`). Every reply is also stored as a bot message. A photo over 5 MB, a file that is not JPEG or PNG (the first bytes are checked; the server never decodes the image), or a download that fails gets its own reply and stores no message.

The download uses `https` only, from a host in `ZALO_MEDIA_HOSTS`. It follows at most 3 redirects, checks each target the same way, and refuses a host whose addresses are loopback, private, link-local, unique-local or unspecified. A refused URL is logged without its query string.

The `photos` group is on only when `PHOTO_STORAGE` and every `S3_*` value except `S3_FORCE_PATH_STYLE` are set. While it is off the service logs `[config] photos is off; missing: <NAMES>.` and photo messages wait; texts are still stored.

| Env var | Default | Meaning |
|---|---|---|
| `PHOTO_STORAGE` | none | `s3` (Cloudflare R2, MinIO or any S3-compatible store) |
| `S3_ENDPOINT` | none | Store URL, for example `https://<account>.r2.cloudflarestorage.com` |
| `S3_REGION` | none | `auto` for R2 |
| `S3_BUCKET` | none | Bucket name |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | none | Access key of the bucket |
| `S3_FORCE_PATH_STYLE` | `false` | `true` for MinIO |

To run with MinIO by hand (never in CI): `docker compose --profile minio up -d --wait minio`. It creates the bucket `photos`. Then set `PHOTO_STORAGE=s3`, `S3_ENDPOINT=http://localhost:9000`, `S3_REGION=us-east-1`, `S3_BUCKET=photos`, `S3_ACCESS_KEY_ID=minioadmin`, `S3_SECRET_ACCESS_KEY=minioadmin` and `S3_FORCE_PATH_STYLE=true`. Set `MINIO_PORT` if port 9000 is taken. The MinIO console is at `http://localhost:9001`. The image is `bitnamilegacy/minio`, because MinIO no longer publishes images on Docker Hub.

## Save what two readers agree on

Every text and photo from a person in a workspace goes to the readers (the cheap pair, then the strong pair when the cheap pair disagrees). When a pair agrees on work data, the server saves one `records` row per item in one transaction with the saved reply and marks the message `accepted`. `read_by` is `cheap_pair` or `expensive_pair`. When no pair agrees, nothing is saved, the sender is asked to send again and the message is `unresolved`. A maintenance item without a plate saves nothing from the whole message and asks for the plate. A message from a member with no work data gets the upload-only reply. A question in a member's message is ignored. Admins get the chat model (see "Admins ask the bot").

The `readers` group is on only when `READER_PROVIDER` and the 12 `READER_<SLOT>_BASE_URL/_API_KEY/_MODEL` values are set (see "Evaluate the readers"). While it is off the service logs `[config] readers is off; missing: <NAMES>.` and the messages of people in a workspace wait.

## Admins ask the bot

A message from an admin goes to the chat model when it has no work data. When it has work data and a question, the server saves the data and sends the saved reply first, then the chat model answers. Unresolved, no-plate and duplicate messages get their fixed replies and never reach the model. Members never reach the model. The model calls three tools, up to 5 rounds: `search_records`, `count_records` and `list_members`. Each tool reloads the caller's membership and refuses anyone who is not a current admin of the workspace. The answer is stored only when the admin's membership row is still the same row and still `admin`. If the chat model fails, the admin gets the failure text; the saved records stay.

The `chat` group is on only when `CHAT_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` are set. While it is off the service logs `[config] chat is off; missing: <NAMES>.` and an admin's messages wait before the readers run.

| Env var | Default | Meaning |
|---|---|---|
| `CHAT_PROVIDER` | none, required | `openai-compatible` |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | none, required | Chat Completions endpoint, key and model (`gpt-6-luna` in production) |
| `LLM_TIMEOUT_MS` | `60000` | Wait for one chat reply |
| `LLM_REASONING_EFFORT` | `none` | Sent as `reasoning_effort`; an empty value means it is not sent. `gpt-6-luna` supports function calling on Chat Completions only with `none` |

The search uses the Postgres `unaccent` extension. The migrations enable it.

### Scheduled tasks

An admin asks for a task that runs once, daily, weekly or monthly (Vietnam time) through `propose_scheduled_task`. The tool stores a `draft` in `scheduled_tasks` (at most one open draft per admin per workspace, and at most 20 `draft` or `active` tasks per workspace). The server appends the draft card to the answer. The card carries the choice `draft_confirm`, which is stored only when the card is marked `sent` and the admin wrote nothing newer. Then `1` or `Lưu lịch` makes the task `active` and `2` or `Hủy lịch` cancels it. Any other message clears the choice. These replies never reach the readers or the chat model. `list_scheduled_tasks` and `cancel_scheduled_task` list and cancel the caller's own tasks. Nothing runs a saved task yet.

## Row-level security

The tables `records`, `messages` and `reply_photos` have row-level security (`ENABLE`, not `FORCE`). A row is visible and writable only when its `workspace_id` equals the setting `app.workspace_id`, set with `SET LOCAL` inside each transaction. For a member, `app.owner_user_id` must also equal the row's `user_id`. With no setting, no row is visible. The service connects as the role `app_runtime`: `LOGIN`, no superuser, no `BYPASSRLS`, owns no table, cannot change the schema. The table owner bypasses the policies, so the barrier is on only when `DATABASE_URL` uses `app_runtime`.

At start the service refuses to run as a superuser or a role with `BYPASSRLS`. When its role owns the tables, it logs `[config] database role owns the tables; row-level security is not enforced until DATABASE_URL uses app_runtime.`

Owner action, once per database. A migration creates `app_runtime` without a password when the role does not exist, and always reapplies its grants. Set the password as the database owner, then set `DATABASE_URL` in Render to the same host and database with the user `app_runtime`:

```sql
ALTER ROLE app_runtime WITH LOGIN PASSWORD '<a long random password>';
```

The password lives only in this step and in `DATABASE_URL`, never in a migration. `MIGRATION_DATABASE_URL` keeps the database owner's connection string. Check the result with `select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user;`, which returns `app_runtime`, `f`, `f`.

CI and local tests: the service under test connects as `app_runtime`. The Postgres service container's superuser migrates in CI. `test/integration/` reads `SUPERUSER_DATABASE_URL` (default `postgres:postgres` on the host of `DATABASE_URL`) for the test that refuses a superuser.

## Migrations

Run them by hand against the local database:

```sh
npm run build
MIGRATION_DATABASE_URL=postgres://app_owner:app_owner@localhost:5432/secretary node dist/bootstrap/migrate.js
```

The runner logs `[migrate] applied: <names>` or `[migrate] nothing to apply`. It never logs the database URL. It exits 1 when `MIGRATION_DATABASE_URL` is empty, without connecting. When the database holds a migration this build does not have (after a rollback), it logs `database is ahead of this build (rollback); skipping migrations` and exits 0.

Every schema change is a new file in `src/app/db/migrations/`, named `NNNN_what_it_does.ts` and exporting `up(pgm)`. The builder offers only `sql(statement)` and `noTransaction()` (`src/app/db/migration-builder.ts`).

Rules:

- **Expand only.** A deploy only adds: new tables (with their indexes and constraints in the same migration), nullable columns or columns with a constant default, concurrent indexes on existing tables, and constraints on existing tables added `NOT VALID` and validated in a later migration. Drops, renames and `NOT NULL` on an existing column come in a later PR, after no running code uses the old shape.
- **Never edit a merged migration.** `ci / migrations` fails when a PR changes, renames or deletes a migration file that already exists on `main`.
- **Locks on existing tables.** Call `lockTables(pgm, ['table', ...])` (`src/app/db/lock-tables.ts`) first. It takes `LOCK TABLE ... NOWAIT` in a fixed table order. When a lock is busy (`55P03`), the runner drops its connection, sleeps 2 s +/- 25 %, and retries. Waiting for another runner's migration lock counts against the same budget. After 60 s in total it exits 1.
- **Timeouts.** Every transactional migration runs with `SET LOCAL lock_timeout = '1s'` and `SET LOCAL statement_timeout = '30s'`.
- **Concurrent indexes.** Call `pgm.noTransaction()` and write `CREATE INDEX CONCURRENTLY`. Such a migration runs with `statement_timeout = '10min'`. Before it builds an index, the runner drops a leftover index of the same name only when that index is invalid. It never drops a valid one. Keep one index build per migration, because a failure outside a transaction leaves the earlier statements applied.
- **Backfills** are separate migrations, in small resumable batches, each with a test on existing rows.

## Deploy to Render

`render.yaml` describes one web service (Docker, Singapore) and one Postgres 17 database (Singapore). After the checks pass on a commit on `main` (`autoDeployTrigger: checksPass`), Render builds the `Dockerfile`, runs `node dist/bootstrap/migrate.js` as the pre-deploy command, and starts `node dist/bootstrap/main.js` only if that exits 0. A failed migration cancels the deploy and the previous release keeps serving. The web process never migrates at startup.

Owner action: in a Render Hobby workspace, allow Render's GitHub app on this repository, then create a Blueprint from `render.yaml`. No deploy hook, deploy workflow or GitHub secret is involved. Render fills `MIGRATION_DATABASE_URL` from the database's internal connection string. `DATABASE_URL` is entered by hand (see Row-level security). The database has `ipAllowList: []`, so only Render services in the same account and region reach it. An operator who needs external SQL adds their IP in the Render dashboard.

Check a deploy: `curl https://<service>.onrender.com/health` returns `200` and a `commit` equal to `git rev-parse origin/main`. Every deploy log starts with a `[migrate]` line.

Another host needs only the `Dockerfile`: run `node dist/bootstrap/migrate.js` before `node dist/bootstrap/main.js`, and set `GIT_COMMIT`.

## Evaluate the readers

A manual tool that reads a folder of receipt photos with the cheap reader pair, escalates to the strong pair when they disagree, and prints what each reader read. It never writes the database and needs an OpenAI API key.

```sh
export READER_PROVIDER=openai-compatible
export READER_REASONING_EFFORT=low
for slot in CHEAP_1 CHEAP_2 STRONG_1 STRONG_2; do
  export READER_${slot}_BASE_URL=https://api.openai.com/v1
  export READER_${slot}_API_KEY=<your OpenAI key>
done
export READER_CHEAP_1_MODEL=gpt-6-luna
export READER_CHEAP_2_MODEL=gpt-6.1-terra
export READER_STRONG_1_MODEL=gpt-6.1-sol
export READER_STRONG_2_MODEL=gpt-6-astra
npm run build
node dist/bootstrap/evaluate-readers.js <photo folder>
```

The command reads every `.jpg`, `.jpeg` and `.png` file in the folder. Per photo it prints each reading, whether each pair agrees, and the outcome (`cheap_pair`, `expensive_pair` or `unresolved`). The last lines are `photos`, `cheap_pair`, `expensive_pair`, `unresolved`, `escalation rate` and `details agreement`.

Put an `expected.json` next to the photos to also get `amounts correct` and `dates correct`:

```json
{ "receipt-1.jpg": { "amount_vnd": 1250000, "occurred_on": "2026-10-30" } }
```

| Env var | Default | Meaning |
|---|---|---|
| `READER_PROVIDER` | none, required | `openai-compatible` |
| `READER_<SLOT>_BASE_URL`, `_API_KEY`, `_MODEL` | none, required | One set per slot: `READER_CHEAP_1`, `READER_CHEAP_2`, `READER_STRONG_1`, `READER_STRONG_2` |
| `READER_TIMEOUT_MS` | `60000` | Wait for one reader reply |
| `READER_REASONING_EFFORT` | not sent | Sent as `reasoning_effort` when set |

When a required value is missing the command prints `readers is not configured: missing <NAMES>.` and exits with 1.

## Check your change

```sh
npm run lint
npm run typecheck
npm test            # needs the Postgres from docker compose; reads DATABASE_URL
npm run check:migrations -- origin/main
npm run mutation    # Stryker on all of src/app, report only; CI mutates only the changed files
```

Tests that need Postgres read `DATABASE_URL` and default to `postgres://app_owner:app_owner@localhost:5432/secretary`. The migration tests create a throw-away database per test, so the role needs `CREATEDB` (`app_owner` has it) and `npm test` runs `npm run build` once for the built-entry test.

## Checks on every pull request

| Check | What it does |
|---|---|
| `ci / lint` | ESLint, including the import rules below |
| `ci / typecheck` | `tsc --noEmit` |
| `ci / test` | Builds the schema by running the migrations, then Vitest, against a Postgres 17 service container |
| `ci / migrations` | Fails when a PR changes, renames or deletes a migration file that already exists on `main` |
| `ci / mutation` | Stryker on the `src/app/**` files the PR changes (migrations excluded; skipped when none changed). Runs only on PRs with the label `ready-to-merge` |
| `security / audit` | `npm audit` of production packages, fails on high severity |
| `security / secrets` | gitleaks over the whole git history |

## Code layout and import rules

| Folder | Role | May import |
|---|---|---|
| `src/app/` | Our code | `src/app/`, `src/services/`, Node built-ins, plain libraries such as `zod` |
| `src/services/` | Interfaces our code calls | `src/services/` |
| `src/providers/<role>/` | One class per provider | `src/services/`, vendor packages, Node built-ins |
| `src/bootstrap/` | Composition root and commands | anything |

Vendor packages (`openai`, `@aws-sdk/*`, `pg`, `node-pg-migrate`, `fastify`) are imported only in `src/providers/` and `src/bootstrap/`. Two exceptions: `src/app/db/` may import `src/providers/database/postgres.ts`, and only `src/bootstrap/migrate.ts` may import `src/providers/database/migration-tool.ts`. ESLint enforces all of this. The rules live in `eslint/architecture.js`; `test/architecture/` holds one small project per rule.
