import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['member_memories', 'user_memories']);
  pgm.sql('DROP TABLE user_memories, member_memories');
}
