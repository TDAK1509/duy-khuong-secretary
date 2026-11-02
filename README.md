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

`GET /health` answers `200 {"ok":true}` when the database answers, and `503 {"ok":false}` when it does not.

## Check your change

```sh
npm run lint
npm run typecheck
npm test            # needs the Postgres from docker compose; reads DATABASE_URL
npm run check:migrations -- origin/main
npm run mutation    # Stryker on src/app, report only
```

Tests that need Postgres read `DATABASE_URL` and default to `postgres://app_owner:app_owner@localhost:5432/secretary`.

## Checks on every pull request

| Check | What it does |
|---|---|
| `ci / lint` | ESLint, including the import rules below |
| `ci / typecheck` | `tsc --noEmit` |
| `ci / test` | Vitest against a Postgres 17 service container |
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
