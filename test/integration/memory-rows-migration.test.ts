import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as createMemoryRows } from '../../src/app/db/migrations/0053_create_private_memories_and_member_facts.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { RESTORE_THE_OLD_MEMORY_TABLES } from './proposed-organization-shape.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migration that gives each memory line its own row', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let lanUserId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    await database.query(RESTORE_THE_OLD_MEMORY_TABLES);
    await database.query('DROP TABLE private_memories, member_facts');
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
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
    await database.query(`INSERT INTO user_memories (workspace_id, user_id, markdown) VALUES ('${workspaceId}', '${lanUserId}', E'- A\\n- B')`);

    await runMigration();

    expect(await database.query('SELECT author_user_id, readers, fact FROM private_memories ORDER BY created_at')).toEqual([
      { author_user_id: lanUserId, readers: 'author', fact: 'A' },
      { author_user_id: lanUserId, readers: 'author', fact: 'B' },
    ]);
  });

  it('turns the facts about a member into shared rows with no author', async () => {
    await database.query(`INSERT INTO member_memories (workspace_id, user_id, markdown) VALUES ('${workspaceId}', '${hungUserId}', '- X')`);

    await runMigration();

    expect(await database.query('SELECT member_user_id, author_user_id, readers, fact FROM member_facts')).toEqual([
      { member_user_id: hungUserId, author_user_id: null, readers: 'admins_and_member', fact: 'X' },
    ]);
  });
});
