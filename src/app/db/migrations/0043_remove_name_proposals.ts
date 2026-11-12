import type { MigrationBuilder } from '../migration-builder.ts';

const PROPOSAL_PREFIX = 'Tên mới đọc được gần giống tên đã lưu:';

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    DELETE FROM outbound_messages
    WHERE status IN ('queued', 'held')
      AND (offered_choice ->> 'kind' = 'name_match' OR starts_with(body, '${PROPOSAL_PREFIX}'))
  `);
}
