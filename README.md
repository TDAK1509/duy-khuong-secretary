# Trợ lý

A Vietnamese Zalo chat assistant for truck companies. One TypeScript package (Node 24, npm).

## Run it locally

```sh
docker compose up -d --wait
npm ci
npm run build
DATABASE_URL=postgres://app_owner:app_owner@localhost:5432/secretary npm start
curl -i http://localhost:3000/health
```

`docker compose up` starts Postgres 17 with the database `secretary`, owned by the role `app_owner`. That role is not a superuser. If port 5432 is taken, set `POSTGRES_PORT` before `docker compose up` and use that port in `DATABASE_URL`.

| Env var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none, required | Postgres connection string |
| `PORT` | `3000` | HTTP port |
| `GIT_COMMIT` | `RENDER_GIT_COMMIT`, else none | The deployed commit, shown by `/health` |
| `MIGRATION_DATABASE_URL` | none | Direct connection as the schema-owner role. Read only by `node dist/bootstrap/migrate.js` |

`GET /health` answers `200 {"ok":true,"commit":"<sha>"}` when the database answers, and `503 {"ok":false,"commit":"<sha>"}` when it does not. `commit` is `GIT_COMMIT`, else `RENDER_GIT_COMMIT`, else `null`.

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

Owner action: in a Render Hobby workspace, allow Render's GitHub app on this repository, then create a Blueprint from `render.yaml`. No deploy hook, deploy workflow or GitHub secret is involved. Render fills `DATABASE_URL` and `MIGRATION_DATABASE_URL` from the database's internal connection string. The database has `ipAllowList: []`, so only Render services in the same account and region reach it. An operator who needs external SQL adds their IP in the Render dashboard.

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
npm run mutation    # Stryker on src/app, report only
```

Tests that need Postgres read `DATABASE_URL` and default to `postgres://app_owner:app_owner@localhost:5432/secretary`. The migration tests create a throw-away database per test, so the role needs `CREATEDB` (`app_owner` has it) and `npm test` runs `npm run build` once for the built-entry test.

## Checks on every pull request

| Check | What it does |
|---|---|
| `ci / lint` | ESLint, including the import rules below |
| `ci / typecheck` | `tsc --noEmit` |
| `ci / test` | Builds the schema by running the migrations, then Vitest, against a Postgres 17 service container |
| `ci / migrations` | Fails when a PR changes, renames or deletes a migration file that already exists on `main` |
| `ci / mutation` | Stryker on `src/app/**`. Runs only on PRs with the label `ready-to-merge` |
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
