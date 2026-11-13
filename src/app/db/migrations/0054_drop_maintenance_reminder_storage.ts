import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['maintenance_notifications', 'scheduled_tasks']);
  foldRulesIntoInstructions(pgm);
  pgm.sql('DROP TABLE maintenance_notifications');
  pgm.sql('ALTER TABLE scheduled_tasks DROP COLUMN maintenance_rules');
}

function foldRulesIntoInstructions(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE scheduled_tasks AS task
    SET instruction = folded.instruction
    FROM (
      SELECT scheduled_tasks.id, scheduled_tasks.instruction || E'\\n\\nMốc nhắc bảo dưỡng: '
        || string_agg(rule.value ->> 'maintenance_item' || ' sau ' || (rule.value ->> 'age_days') || ' ngày', '; ' ORDER BY rule.position)
        || '. Dùng maintenance_status để xem lần gửi gần nhất của từng xe. Chỉ nhắc xe có số ngày kể từ lần gửi gần nhất từ mốc trở lên.' AS instruction
      FROM scheduled_tasks
      CROSS JOIN LATERAL jsonb_array_elements(scheduled_tasks.maintenance_rules) WITH ORDINALITY AS rule (value, position)
      WHERE scheduled_tasks.status = 'active'
      GROUP BY scheduled_tasks.id, scheduled_tasks.instruction
    ) AS folded
    WHERE task.id = folded.id AND char_length(folded.instruction) <= 2000
  `);
}
