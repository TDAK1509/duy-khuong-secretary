import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as removeNameProposals } from '../../src/app/db/migrations/0043_remove_name_proposals.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const PROPOSAL_BODY = 'Tên mới đọc được gần giống tên đã lưu:\n1. "A" → "B" (1 giấy tờ)';

describe('the migration that removes the name proposals', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  });

  afterEach(async () => {
    await database.drop();
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    removeNameProposals({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    for (const statement of statements) await database.query(statement);
  }

  it('deletes a queued offer and a held proposal text and keeps an ordinary text', async () => {
    const offered = await insertOutboundMessage(database, { externalUserId: 'zu-duy', body: PROPOSAL_BODY });
    const offer = JSON.stringify({ kind: 'name_match', workspace_id: workspaceId, pairs: [] });
    await database.query(`UPDATE outbound_messages SET offered_choice = '${offer}'::jsonb WHERE id = '${offered}'`);
    await insertOutboundMessage(database, { externalUserId: 'zu-duy', body: PROPOSAL_BODY, status: 'held' });
    await insertOutboundMessage(database, { externalUserId: 'zu-duy', body: 'Đã lưu: đổ dầu.' });

    await runMigration();

    expect(await database.query('SELECT status, body FROM outbound_messages')).toEqual([{ status: 'queued', body: 'Đã lưu: đổ dầu.' }]);
  });

  it('clears a waiting name choice and keeps a waiting workspace pick', async () => {
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    const nameMatch = JSON.stringify({ kind: 'name_match', workspace_id: workspaceId, pairs: [] });
    const workspacePick = JSON.stringify({ kind: 'workspace_pick', workspace_ids: [workspaceId] });
    await database.query(`UPDATE channel_identities SET pending_choice = '${nameMatch}'::jsonb WHERE external_user_id = 'zu-duy'`);
    await database.query(`UPDATE channel_identities SET pending_choice = '${workspacePick}'::jsonb WHERE external_user_id = 'zu-hung'`);

    await runMigration();

    expect(await database.query('SELECT external_user_id, pending_choice FROM channel_identities ORDER BY external_user_id')).toEqual([
      { external_user_id: 'zu-duy', pending_choice: null },
      { external_user_id: 'zu-hung', pending_choice: { kind: 'workspace_pick', workspace_ids: [workspaceId] } },
    ]);
  });
});
