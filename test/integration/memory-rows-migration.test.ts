import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as createMemoryRows } from '../../src/app/db/migrations/0053_create_private_memories_and_member_facts.ts';
import { insertUserMemory } from './user-memory-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migration that gives each memory line its own row', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let lanUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    await database.query('DROP TABLE private_memories');
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
  });

  afterEach(async () => {
    await database.drop();
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    createMemoryRows({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    for (const statement of statements) await database.query(statement);
  }

  it('turns the private memory lines of a user into rows with the user as author', async () => {
    await insertUserMemory(database, { workspaceId, userId: lanUserId, markdown: '- A\n- B' });

    await runMigration();

    expect(await database.query('SELECT author_user_id, readers, fact FROM private_memories ORDER BY created_at')).toEqual([
      { author_user_id: lanUserId, readers: 'author', fact: 'A' },
      { author_user_id: lanUserId, readers: 'author', fact: 'B' },
    ]);
  });
});
