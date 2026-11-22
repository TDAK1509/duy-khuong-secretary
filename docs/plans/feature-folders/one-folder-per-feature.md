# Each feature has one folder per layer, and CI refuses a second one

These PRs share one file because PR 2 needs PR 1: the check in PR 2 fails on
the folders PR 1 merges.

Facts every PR in this file relies on:

- The code has three layers, each a folder of feature folders: `src/app`,
  `src/services` and `src/providers`. `src/bootstrap` holds files only. The
  same feature may have a folder in each layer (`src/services/chat` and
  `src/providers/chat`). Feature folders may have subfolders
  (`src/app/admin-chat/tools`, `src/app/db/migrations`).
- The owner's rule: one folder per feature in a layer. Never two sibling
  folders for one feature, such as `services/feature-a1` and
  `services/feature-a2`.
- This plan fixes three sibling groups in `src/app` that are one feature:
  - `documents`, `document-reads` (operator rereads) and `document-templates`,
    plus `template-backfills` (rereads for templates): one feature, documents.
  - `schedules` and `scheduled-runs`: one feature, scheduled tasks.
  - `internal-admin` (the operator web dashboard) and `internal-mcp` (the
    operator MCP server): one feature, internal operator tools.
  `src/services` and `src/providers` have no such pair.
- Folders that stay separate features: `intake` (receiving a message and
  replying), `processing` (the inbound event queue), `reading` (the reader
  prompts and schema), `records` (the per-item records table), `memory`
  (private notes), `access`, `identities`, `channel-auth`, `admin-chat`. They
  call each other, but each owns one job.
- Paths outside the imports do not change: `tsconfig.json` and
  `tsconfig.build.json` include all of `src`; `eslint/architecture.js` keys on
  the layer roots only; `Dockerfile`, `package.json` and `render.yaml` use only
  `dist/bootstrap/` entry points; migrations stay in `src/app/db/migrations`.
  No dynamic import or runtime file read uses a moved path.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck and
  `npm run check:migrations`, a script in `src/bootstrap/check-migrations.ts`
  run with `node`.
- This repository adds no tests unless the owner asks for them. Every PR below
  lists none, and its outcome steps are the check.

---

## PR 1: The documents, schedules and internal tools each live in one folder

### The mindset of this PR

- Goal: Each of the three features above has one folder in `src/app`. Nothing
  else changes: the service, the operator commands and every behavior work as
  before.
- What matters most: 1. No behavior change: only files move and imports
  change. 2. A reader finds every file of a feature under one folder.
- Out of scope: Renaming files or functions. Splitting large folders. Any
  other folder. The CI check (PR 2).

### Outcome

Brief: Files move into the feature's folder, in subfolders named for their
part. Imports and README paths follow.

Before: Documents code sits in four sibling folders: `src/app/documents`,
`src/app/document-reads`, `src/app/document-templates` and
`src/app/template-backfills`.
After: It all sits under `src/app/documents`, with `rereads/`, `templates/`
and `templates/backfills/`.

Steps, for the owner (after deploy):

- In Zalo, send a photo, ask a question, and list the scheduled tasks. All work
  as before.
- Open the internal dashboard and log in. It works as before.

Steps, for the developer (before merging):

- Search `src`, `README.md` and the config files for the six old folder names.
  There are no hits.
- `npm run lint`, `npm run typecheck` and `npm run build` pass.
- Run `node dist/bootstrap/reread-documents.js` with no arguments. It prints its
  usage, as before.
- `ls src/app` shows no `document-reads`, `document-templates`,
  `template-backfills`, `scheduled-runs`, `internal-admin` or `internal-mcp`.

### Solution

- Moves (with `git mv`, so history follows):
  - `src/app/document-reads/*` → `src/app/documents/rereads/`.
  - `src/app/document-templates/*` → `src/app/documents/templates/`.
  - `src/app/template-backfills/*` → `src/app/documents/templates/backfills/`.
  - `src/app/scheduled-runs/*` → `src/app/schedules/runs/`.
  - `src/app/internal-admin/*` → `src/app/internal/admin/`.
  - `src/app/internal-mcp/*` → `src/app/internal/mcp/`.
- Update every import: `src/bootstrap/main.ts`, `assemble-service.ts`,
  `build-backfill-step.ts`, `reread-documents.ts`, and inside `src/app`, for
  example `admin-chat/tools/document-template-arguments.ts`,
  `admin-chat/tools/save-document-template-tool.ts`,
  `documents/list-reader-templates.ts`, `ticker/run-tick.ts`,
  `http/internal-admin.ts`, `http/internal-mcp.ts`,
  `intake/find-intake-sender.ts`. Compiled entry points under
  `dist/bootstrap/` keep their names.
- README: update the paths it names.
- Old plan files under `docs/plans/` keep the old paths. They are history.

Tests: none (see the shared facts above).

### Revert cost

The files go back to six sibling folders. Nothing stored changes.

---

## PR 2: The rule is written down, and CI fails on two folders for one feature

Depends on: PR 1.

### The mindset of this PR

- Goal: The rule is in `CLAUDE.md`, and a pull request that adds a sibling
  folder sharing a word with an existing one fails CI with a message that
  names the folders. Two folders for one feature with unrelated names stay a
  review question.
- What matters most: 1. A second folder named after an existing feature always
  fails. 2.
  Today's folders pass. 3. The failure message tells the author what to do.
- Out of scope: Folder names inside a feature folder. Files. Layers other than
  `src/app`, `src/services` and `src/providers`. Judging whether two folders
  with unrelated names do the same thing (that stays a review question).

### Outcome

Brief: A new script lists the direct subfolders of each layer and fails when
two of them share a word. A new CI step runs it. `CLAUDE.md` states the rule.

Before: A developer adds `src/app/document-reads` next to
`src/app/documents`, and CI passes.
After: CI fails with `[feature-folders] src/app: "documents" and
"document-reads" share "document". Put one feature in one folder; use a
subfolder for a part of it.`

Steps, for the developer (before merging):

- Run `node src/bootstrap/check-feature-folders.ts`. It prints
  `[feature-folders] one folder per feature` and exits 0 (on the folders after
  PR 1 it finds no pair, including `access`, `identities`, `admin-chat`,
  `internal`, `intake`, `reading` and `records`).
- Create an empty `src/app/schedule-rules/.keep` and run it again. It prints the
  message for `schedules` and `schedule-rules` and exits 1. Delete the folder.
- Create `src/services/chat-v2/.keep`. It fails for `chat` and `chat-v2`.
  Delete it.
- Create `src/app/documents/reads-v2/.keep`. It passes: subfolders of a
  feature are not checked. Delete it.
- Push the branch. The CI step "Check one folder per feature" passes.

### Solution

- New script `src/bootstrap/check-feature-folders.ts`, run with `node` like
  `check-migrations.ts`, and an npm script `check:feature-folders`.
  - Plain `node` runs it: erasable TypeScript only, `.ts` import specifiers,
    like `check-migrations.ts`.
  - For each of `src/app`, `src/services`, `src/providers`: take the direct
    subfolders, and split each name into words on `-`.
  - Normalize a word: lower-case; remove a final `s` unless it ends in `ss`
    ("documents" → "document", "schedules" → "schedule", "access" stays,
    "identities" → "identitie"). This is a naming heuristic, not grammar.
  - Two words match when their normalized forms are equal, or when the
    shorter normalized form has at least 5 letters and the longer one starts
    with it ("schedule" and "scheduled", "document" and "documents").
  - Two sibling folders that share a matching word fail, one line per pair, in
    the format above. Exit 1 on any failure, else print the pass line and exit
    0.
  - No exception list: a false match is fixed by a better folder name.
- CI (`ci.yml`), right after `npm run typecheck` and before the migration
  check:

  ```yaml
  - name: Check one folder per feature
    run: npm run check:feature-folders
  ```
- `CLAUDE.md`, a new "Code layout" section:
  - One folder per feature in each layer (`src/app`, `src/services`,
    `src/providers`). The same feature may have one folder in each layer.
  - A part of a feature goes in a subfolder of that feature's folder, never in
    a sibling folder named after the feature.
  - CI enforces it with `npm run check:feature-folders`.
- README: one line about the check, next to `check:migrations`.

Tests: none (see the shared facts above).

### Revert cost

CI stops checking folder names, and the rule leaves `CLAUDE.md`. Nothing in
production changes.
