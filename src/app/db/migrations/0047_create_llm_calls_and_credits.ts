import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const OPERATOR_KINDS = `'operator_reread', 'operator_backfill'`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['workspaces']);
  pgm.sql('ALTER TABLE workspaces ADD COLUMN credit_balance numeric(14,3) NOT NULL DEFAULT 0');
  createLlmCalls(pgm);
  createCreditAdditions(pgm);
}

function createLlmCalls(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE llm_calls (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('photo_read', 'text_read', 'chat_answer', 'scheduled_run', 'chatgpt_text_save', ${OPERATOR_KINDS})),
      model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
      input_tokens integer CHECK (input_tokens >= 0),
      cached_input_tokens integer CHECK (cached_input_tokens >= 0),
      cache_write_tokens integer CHECK (cache_write_tokens >= 0),
      output_tokens integer CHECK (output_tokens >= 0),
      cost_usd numeric(14,9) NOT NULL CHECK (cost_usd >= 0),
      credits numeric(14,3) NOT NULL CHECK (credits >= 0),
      balance_after numeric(14,3),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nulls(input_tokens, cached_input_tokens, cache_write_tokens, output_tokens) IN (0, 4)),
      CHECK (kind NOT IN (${OPERATOR_KINDS}) OR credits = 0),
      CHECK (kind NOT IN (${OPERATOR_KINDS}) OR balance_after IS NULL)
    )
  `);
  pgm.sql('CREATE INDEX llm_calls_workspace_id_created_at_idx ON llm_calls (workspace_id, created_at)');
  pgm.sql('REVOKE UPDATE, DELETE ON llm_calls FROM app_runtime');
}

function createCreditAdditions(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE credit_additions (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      credits numeric(14,3) NOT NULL CHECK (credits > 0),
      source text NOT NULL CHECK (source IN ('starting_grant', 'internal_user')),
      added_by uuid REFERENCES users (id),
      note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 500),
      balance_after numeric(14,3) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((source = 'internal_user') = (added_by IS NOT NULL))
    )
  `);
  pgm.sql('CREATE INDEX credit_additions_workspace_id_created_at_idx ON credit_additions (workspace_id, created_at)');
  pgm.sql('REVOKE UPDATE, DELETE ON credit_additions FROM app_runtime');
}
