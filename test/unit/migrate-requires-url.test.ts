import { describe, expect, it, vi } from 'vitest';
import { runMigrationCommand } from '../../src/bootstrap/migrate.ts';

const { migrateDatabase } = vi.hoisted(() => ({ migrateDatabase: vi.fn() }));

vi.mock('../../src/providers/database/migration-tool.ts', () => ({ migrateDatabase }));

describe('the migration runner without a migration URL', () => {
  it('exits 1 without connecting to a database', async () => {
    const lines: string[] = [];

    const exitCode = await runMigrationCommand(
      { MIGRATION_DATABASE_URL: '' },
      { directory: new URL('file:///unused/'), log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(1);
    expect(migrateDatabase).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('MIGRATION_DATABASE_URL');
  });
});
