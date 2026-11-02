import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    CREATE TABLE scheduled_tasks (
      id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
      created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
      instruction text NOT NULL CHECK (char_length(instruction) BETWEEN 1 AND 2000),
      repeat text NOT NULL CHECK (repeat IN ('once', 'daily', 'weekly', 'monthly')),
      run_once_at timestamptz,
      time_of_day time,
      weekday smallint CHECK (weekday BETWEEN 1 AND 7),
      day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'cancelled')),
      next_run_at timestamptz,
      last_run_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (repeat = 'once' AND run_once_at IS NOT NULL AND time_of_day IS NULL AND weekday IS NULL AND day_of_month IS NULL)
        OR (repeat = 'daily' AND time_of_day IS NOT NULL AND weekday IS NULL AND day_of_month IS NULL AND run_once_at IS NULL)
        OR (repeat = 'weekly' AND time_of_day IS NOT NULL AND weekday IS NOT NULL AND day_of_month IS NULL AND run_once_at IS NULL)
        OR (repeat = 'monthly' AND time_of_day IS NOT NULL AND day_of_month IS NOT NULL AND weekday IS NULL AND run_once_at IS NULL)
      ),
      CHECK (status = 'active' OR next_run_at IS NULL)
    )
  `);
  pgm.sql(`CREATE INDEX scheduled_tasks_next_run_at_idx ON scheduled_tasks (next_run_at) WHERE status = 'active'`);
  pgm.sql('CREATE INDEX scheduled_tasks_creator_idx ON scheduled_tasks (workspace_id, created_by)');
  pgm.sql(
    `CREATE UNIQUE INDEX scheduled_tasks_one_draft_idx ON scheduled_tasks (workspace_id, created_by) WHERE status = 'draft'`,
  );
}
