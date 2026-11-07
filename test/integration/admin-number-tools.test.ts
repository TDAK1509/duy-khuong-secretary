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

  async function runTotalNumbers(label: string, groupBy = 'none', filters: Filters = {}, scope: AccessScope = duy): Promise<string> {
    const args = { label, text: null, category: null, member: null, plate: null, added_from: null, added_to: null, occurred_from: null, occurred_to: null, ...filters, group_by: groupBy };
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), invites: new CreatedInvites(), guard: new AdminTextGuard(false) };
    return runAdminTool(dependencies, scope, { id: 'call_1', name: 'total_numbers', argumentsJson: JSON.stringify(args) });
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

  it('does not list a detail without a valid number', async () => {
    const withoutNumber = { label: 'Nơi nhận', value: 'Cheng Loong', number: null, unit: null };
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [withoutNumber] });

    const output = await runListNumberLabels();

    expect(output).toBe('{"ok":true,"labels":[]}');
  });

  it('lists only the labels of the records that match the text filter', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: [weight(27420), { label: 'Nơi nhận', value: 'Cheng Loong', number: null, unit: null }],
    });
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: [weight(120, 'km', 'Số km'), { label: 'Nơi nhận', value: 'Chánh Dương', number: null, unit: null }],
    });

    const output = await runListNumberLabels({ text: 'cheng loong' });

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng hàng', unit: 'kg', count: 1 }] }));
  });

  it('never lists the labels of another workspace', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(27420)] });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy', details: [weight(120, 'km', 'Số km')] });

    const output = await runListNumberLabels();

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng hàng', unit: 'kg', count: 1 }] }));
  });

  it('totals the sum, count, min and max of a label as exact decimals', async () => {
    for (const number of [27420, 27410]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":2,"sum":"54830","min":"27410","max":"27420"}],"without_number":0}',
    );
  });

  it('matches the label ignoring accents and case', async () => {
    for (const number of [27420, 27410]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(number)] });
    }

    const output = await runTotalNumbers('trong luong hang');

    expect(output).toBe(
      '{"ok":true,"label":"trong luong hang","groups":[{"group":null,"unit":"kg","count":2,"sum":"54830","min":"27410","max":"27420"}],"without_number":0}',
    );
  });

  it('does not add the numbers of a different label', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(100)] });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(50, 'kg', 'Trọng lượng tịnh')] });

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":1,"sum":"100","min":"100","max":"100"}],"without_number":0}',
    );
  });

  it('keeps the units apart in separate groups', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(50, 'l', 'Số lượng')] });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [weight(100, 'kg', 'Số lượng')] });

    const output = await runTotalNumbers('Số lượng');

    expect(output).toBe(
      '{"ok":true,"label":"Số lượng","groups":[{"group":null,"unit":"kg","count":1,"sum":"100","min":"100","max":"100"},{"group":null,"unit":"l","count":1,"sum":"50","min":"50","max":"50"}],"without_number":0}',
    );
  });

  it('groups the total by the date on the document', async () => {
    for (const occurredOn of ['2026-11-06', '2026-11-05']) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', occurredOn, details: [weight(27420)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng', 'occurred_on');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":"2026-11-05","unit":"kg","count":1,"sum":"27420","min":"27420","max":"27420"},{"group":"2026-11-06","unit":"kg","count":1,"sum":"27420","min":"27420","max":"27420"}],"without_number":0}',
    );
  });

  it('groups the total by user, so two members with the same name stay apart, under the latest name of each', async () => {
    const otherHungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung-2', displayName: 'Hùng' });
    const records = [
      { userId: hungUserId, senderName: 'Hùng cũ', number: 100, createdAt: new Date('2026-11-01T10:00:00+07:00') },
      { userId: hungUserId, senderName: 'Hùng', number: 50, createdAt: new Date('2026-11-02T10:00:00+07:00') },
      { userId: otherHungUserId, senderName: 'Hùng', number: 200, createdAt: new Date('2026-11-03T10:00:00+07:00') },
    ];
    for (const { number, ...record } of records) {
      await insertRecordRow(database, { workspaceId, ...record, details: [weight(number)] });
    }

    const output = JSON.parse(await runTotalNumbers('Trọng lượng hàng', 'member')) as { groups: { group: string; sum: string }[] };

    expect(output.groups.map((group) => [group.group, group.sum]).sort()).toEqual([['Hùng', '150'], ['Hùng', '200']]);
  });

  it('groups the total by plate', async () => {
    for (const [vehiclePlate, number] of [['51D67890', 200], ['29C12345', 100]] as const) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', vehiclePlate, details: [weight(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng', 'plate');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":"29C12345","unit":"kg","count":1,"sum":"100","min":"100","max":"100"},{"group":"51D67890","unit":"kg","count":1,"sum":"200","min":"200","max":"200"}],"without_number":0}',
    );
  });

  it('groups the total by category', async () => {
    for (const [category, number] of [['nhận hàng', 200], ['giao hàng', 100]] as const) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category, details: [weight(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng', 'category');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":"giao hàng","unit":"kg","count":1,"sum":"100","min":"100","max":"100"},{"group":"nhận hàng","unit":"kg","count":1,"sum":"200","min":"200","max":"200"}],"without_number":0}',
    );
  });
});
