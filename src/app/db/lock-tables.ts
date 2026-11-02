import type { MigrationBuilder } from './migration-builder.ts';

export function lockTables(pgm: MigrationBuilder, tables: readonly string[]): void {
  const inFixedOrder = [...tables].sort().map(quoteIdentifier);
  pgm.sql(`LOCK TABLE ${inFixedOrder.join(', ')} IN ACCESS EXCLUSIVE MODE NOWAIT`);
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
