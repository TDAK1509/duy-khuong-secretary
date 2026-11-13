import type { TemporaryDatabase } from './temporary-database.ts';

export const RESTORE_THE_MAINTENANCE_REMINDER_STORAGE = `
  CREATE TABLE maintenance_notifications (
    task_id uuid NOT NULL REFERENCES scheduled_tasks (id) ON DELETE CASCADE,
    record_id uuid NOT NULL REFERENCES records (id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, record_id)
  );
  ALTER TABLE scheduled_tasks ADD COLUMN maintenance_rules jsonb NOT NULL DEFAULT '[]';
  ALTER TABLE scheduled_tasks
    ADD CONSTRAINT scheduled_tasks_maintenance_rules_is_array CHECK (jsonb_typeof(maintenance_rules) = 'array');
`;

export type StoredMaintenanceRule = { maintenance_item: string; age_days: number };

export async function restoreMaintenanceReminderStorage(database: TemporaryDatabase): Promise<void> {
  await database.query(RESTORE_THE_MAINTENANCE_REMINDER_STORAGE);
}

export async function storeMaintenanceRules(database: TemporaryDatabase, taskId: string, rules: StoredMaintenanceRule[]): Promise<void> {
  await database.query(`UPDATE scheduled_tasks SET maintenance_rules = '${JSON.stringify(rules)}'::jsonb WHERE id = '${taskId}'`);
}
