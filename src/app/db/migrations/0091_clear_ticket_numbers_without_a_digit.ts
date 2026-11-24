import { lockTables } from '../lock-tables.ts';
import type { MigrationBuilder } from '../migration-builder.ts';

const HAS_NUMBER_WITHOUT_A_DIGIT_FROM_1_TO_9 = `document_number IS NOT NULL AND document_number !~ '[1-9]'`;

export function up(pgm: MigrationBuilder): void {
  lockTables(pgm, ['documents', 'records']);
  pgm.sql(`UPDATE records SET document_number = NULL WHERE ${HAS_NUMBER_WITHOUT_A_DIGIT_FROM_1_TO_9}`);
  pgm.sql(`UPDATE documents SET document_number = NULL WHERE sheet_signature IS NULL AND ${HAS_NUMBER_WITHOUT_A_DIGIT_FROM_1_TO_9}`);
}
