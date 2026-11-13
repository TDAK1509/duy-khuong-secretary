import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    UPDATE scheduled_tasks
    SET instruction = instruction || E'\\n\\nMốc nhắc bảo dưỡng: '
      || (
        SELECT string_agg(rule.value ->> 'maintenance_item' || ' sau ' || (rule.value ->> 'age_days') || ' ngày', '; ' ORDER BY rule.position)
        FROM jsonb_array_elements(scheduled_tasks.maintenance_rules) WITH ORDINALITY AS rule (value, position)
      )
      || '. Dùng maintenance_status để xem lần gửi gần nhất của từng xe. Chỉ nhắc xe có số ngày kể từ lần gửi gần nhất từ mốc trở lên.'
    WHERE maintenance_rules <> '[]'
  `);
}
