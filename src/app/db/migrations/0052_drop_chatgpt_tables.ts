import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['chatgpt_connections', 'chatgpt_login_codes', 'chatgpt_sign_ins']);
  pgm.sql('DROP TABLE chatgpt_connections, chatgpt_sign_ins, chatgpt_login_codes');
}
