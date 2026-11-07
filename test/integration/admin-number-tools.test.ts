import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type Filters = Partial<Record<'text' | 'category' | 'member' | 'plate' | 'added_from' | 'added_to' | 'occurred_from' | 'occurred_to', string>>;

describe('the number tools of an admin', () => {
  const clock = new FakeClock(new Date('2026-11-07T10:00:00+07:00'));
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  async function runListNumberLabels(filters: Filters = {}, scope: AccessScope = duy): Promise<string> {
    const args = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, occurred_from: null, occurred_to: null, ...filters };
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), invites: new CreatedInvites(), guard: new AdminTextGuard(false) };
    return runAdminTool(dependencies, scope, { id: 'call_1', name: 'list_number_labels', argumentsJson: JSON.stringify(args) });
  }

  function weight(number: number, unit = 'kg', label = 'Trọng lượng hàng') {
    return { label, value: `${number} ${unit}`, number, unit };
  }

  it('lists each label with its unit and count, most first', async () => {
    for (const number of [27420, 27410, 100]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(number)] });
    }
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(120, 'km', 'Số km')] });

    const output = await runListNumberLabels();

    expect(output).toBe(
      JSON.stringify({
        ok: true,
        labels: [
          { label: 'Trọng lượng hàng', unit: 'kg', count: 3 },
          { label: 'Số km', unit: 'km', count: 1 },
        ],
      }),
    );
  });

  it('lists spellings that differ only in accents and case as one label, shown as the most common spelling', async () => {
    for (const label of ['trong luong hang', 'Trọng lượng hàng', 'Trọng lượng hàng']) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(100, 'kg', label)] });
    }

    const output = await runListNumberLabels();

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng hàng', unit: 'kg', count: 3 }] }));
  });
});
