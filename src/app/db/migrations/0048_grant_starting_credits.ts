import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    INSERT INTO credit_additions (workspace_id, credits, source, note, balance_after)
    SELECT id, 20000, 'starting_grant', 'Credit ban đầu', 20000 FROM workspaces
  `);
  pgm.sql(`
    UPDATE workspaces SET credit_balance =
      (SELECT sum(credits) FROM credit_additions WHERE credit_additions.workspace_id = workspaces.id)
    WHERE EXISTS (SELECT 1 FROM credit_additions WHERE credit_additions.workspace_id = workspaces.id)
  `);
}
