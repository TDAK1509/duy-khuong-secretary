import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { NameReviewRequest } from '../../src/app/admin-chat/name-review-request.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow, type NewRecordRow } from './record-rows.ts';
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

  it('lists each label with its unit and count, most first', async () => {
    for (const number of [27420, 27410, 100]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(number)] });
    }
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(120, 'km', 'Số km')] });

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
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(100, 'kg', label)] });
    }

    const output = await runListNumberLabels();

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng hàng', unit: 'kg', count: 3 }] }));
  });

  it('lists a label whose stored value has no number with unit null', async () => {
    const unreadWeight = { label: 'Trọng lượng tịnh', value: '26380', number: null, unit: null };
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [unreadWeight] });

    const output = await runListNumberLabels();

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng tịnh', unit: null, count: 1 }] }));
  });

  it('lists a detail saved before numbers existed with unit null', async () => {
    const legacyWeight = { label: 'Trọng lượng hàng', value: '27,420 Kg' };
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [legacyWeight] });

    const output = await runListNumberLabels();

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng hàng', unit: null, count: 1 }] }));
  });

  it('lists a number stored as text with unit null', async () => {
    const textWeight = { label: 'Trọng lượng hàng', value: '27,420 Kg', number: '27420', unit: 'kg' };
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [textWeight] });

    const output = await runListNumberLabels();

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng hàng', unit: null, count: 1 }] }));
  });

  it('lists a label with a number in one record and none in another on two lines', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(26380, 'kg', 'Trọng lượng tịnh')] });
    const unreadWeight = { label: 'Trọng lượng tịnh', value: '26320', number: null, unit: null };
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [unreadWeight] });

    const output = await runListNumberLabels();

    expect(output).toBe(
      JSON.stringify({
        ok: true,
        labels: [
          { label: 'Trọng lượng tịnh', unit: 'kg', count: 1 },
          { label: 'Trọng lượng tịnh', unit: null, count: 1 },
        ],
      }),
    );
  });

  it('lists only the labels of the records that match the text filter', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: [buildNumberDetail(27420), { label: 'Nơi nhận', value: 'Cheng Loong', number: null, unit: null }],
    });
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: [buildNumberDetail(120, 'km', 'Số km'), { label: 'Nơi nhận', value: 'Chánh Dương', number: null, unit: null }],
    });

    const output = await runListNumberLabels({ text: 'cheng loong' });

    expect(output).toBe(
      JSON.stringify({
        ok: true,
        labels: [
          { label: 'Nơi nhận', unit: null, count: 1 },
          { label: 'Trọng lượng hàng', unit: 'kg', count: 1 },
        ],
      }),
    );
  });

  it('never lists the labels of another workspace', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(27420)] });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy', details: [buildNumberDetail(120, 'km', 'Số km')] });

    const output = await runListNumberLabels();

    expect(output).toBe(JSON.stringify({ ok: true, labels: [{ label: 'Trọng lượng hàng', unit: 'kg', count: 1 }] }));
  });

  it('totals the sum, count, min and max of a label as exact decimals', async () => {
    for (const number of [27420, 27410]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":2,"sum":"54830","min":"27410","max":"27420"}],"without_number":0}',
    );
  });

  it('matches the label ignoring accents and case', async () => {
    for (const number of [27420, 27410]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(number)] });
    }

    const output = await runTotalNumbers('trong luong hang');

    expect(output).toBe(
      '{"ok":true,"label":"trong luong hang","groups":[{"group":null,"unit":"kg","count":2,"sum":"54830","min":"27410","max":"27420"}],"without_number":0}',
    );
  });

  it('does not add the numbers of a different label', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(100)] });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(50, 'kg', 'Trọng lượng tịnh')] });

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":1,"sum":"100","min":"100","max":"100"}],"without_number":0}',
    );
  });

  it('keeps the units apart in separate groups', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(50, 'l', 'Số lượng')] });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(100, 'kg', 'Số lượng')] });

    const output = await runTotalNumbers('Số lượng');

    expect(output).toBe(
      '{"ok":true,"label":"Số lượng","groups":[{"group":null,"unit":"kg","count":1,"sum":"100","min":"100","max":"100"},{"group":null,"unit":"l","count":1,"sum":"50","min":"50","max":"50"}],"without_number":0}',
    );
  });

  it('groups the total by the date on the document', async () => {
    for (const occurredOn of ['2026-11-06', '2026-11-05']) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', occurredOn, details: [buildNumberDetail(27420)] });
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
      await insertRecordRow(database, { workspaceId, ...record, details: [buildNumberDetail(number)] });
    }

    const output = JSON.parse(await runTotalNumbers('Trọng lượng hàng', 'member')) as { groups: { group: string; sum: string }[] };

    expect(output.groups.map((group) => [group.group, group.sum]).sort()).toEqual([['Hùng', '150'], ['Hùng', '200']]);
  });

  it('groups the total by plate', async () => {
    for (const [vehiclePlate, number] of [['51D67890', 200], ['29C12345', 100]] as const) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', vehiclePlate, details: [buildNumberDetail(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng', 'plate');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":"29C12345","unit":"kg","count":1,"sum":"100","min":"100","max":"100"},{"group":"51D67890","unit":"kg","count":1,"sum":"200","min":"200","max":"200"}],"without_number":0}',
    );
  });

  it('groups the total by category', async () => {
    for (const [category, number] of [['nhận hàng', 200], ['giao hàng', 100]] as const) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category, details: [buildNumberDetail(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng', 'category');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":"giao hàng","unit":"kg","count":1,"sum":"100","min":"100","max":"100"},{"group":"nhận hàng","unit":"kg","count":1,"sum":"200","min":"200","max":"200"}],"without_number":0}',
    );
  });

  it('puts a record without a date on the document in its own group, after the dated groups', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', occurredOn: null, details: [buildNumberDetail(200)] });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', occurredOn: '2026-11-05', details: [buildNumberDetail(100)] });

    const output = await runTotalNumbers('Trọng lượng hàng', 'occurred_on');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":"2026-11-05","unit":"kg","count":1,"sum":"100","min":"100","max":"100"},{"group":null,"unit":"kg","count":1,"sum":"200","min":"200","max":"200"}],"without_number":0}',
    );
  });

  it('totals only the records that match the text filter', async () => {
    for (const [factory, number] of [['Cheng Loong', 100], ['Chánh Dương', 200]] as const) {
      const receiver = { label: 'Nơi nhận', value: factory, number: null, unit: null };
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(number), receiver] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng', 'none', { text: 'cheng loong' });

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":1,"sum":"100","min":"100","max":"100"}],"without_number":0}',
    );
  });

  it('totals only the records inside the date range on the document', async () => {
    for (const [occurredOn, number] of [['2026-11-04', 100], ['2026-11-05', 200]] as const) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', occurredOn, details: [buildNumberDetail(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng', 'none', { occurred_from: '2026-11-05', occurred_to: '2026-11-06' });

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":1,"sum":"200","min":"200","max":"200"}],"without_number":0}',
    );
  });

  it('totals more records than fit in one search page', async () => {
    for (let record = 0; record < 60; record += 1) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(1)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":60,"sum":"60","min":"1","max":"1"}],"without_number":0}',
    );
  });

  it('counts the records that have the label but no number in without_number', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(100)] });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [{ label: 'Trọng lượng hàng', value: '27,420 Kg' }] });

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":1,"sum":"100","min":"100","max":"100"}],"without_number":1}',
    );
  });

  it('does not sum a number stored as a JSON string and does not fail', async () => {
    const printedNumber = { label: 'Trọng lượng hàng', value: '27,420 Kg', number: '27420', unit: 'kg' };
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [printedNumber] });

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe('{"ok":true,"label":"Trọng lượng hàng","groups":[],"without_number":1}');
  });

  it('gives no groups when no record has the label', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(100)] });

    const output = await runTotalNumbers('Số km');

    expect(output).toBe('{"ok":true,"label":"Số km","groups":[],"without_number":0}');
  });

  it('never totals the numbers of another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy', details: [buildNumberDetail(1000)] });

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe('{"ok":true,"label":"Trọng lượng hàng","groups":[],"without_number":0}');
  });

  it('refuses an unknown group_by with the invalid argument result', async () => {
    const output = await runTotalNumbers('Trọng lượng hàng', 'factory');

    expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: group_by"}');
  });

  it.each(['  ', ''])('refuses the empty label %j with the invalid argument result', async (label) => {
    const output = await runTotalNumbers(label);

    expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: label"}');
  });

  it('does not total a negative number and counts its record in without_number', async () => {
    for (const number of [10, -5]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(number)] });
    }

    const output = await runTotalNumbers('Trọng lượng hàng');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng hàng","groups":[{"group":null,"unit":"kg","count":1,"sum":"10","min":"10","max":"10"}],"without_number":1}',
    );
  });

  it('lists a negative number with unit null', async () => {
    for (const number of [10, -5]) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', details: [buildNumberDetail(number)] });
    }

    const output = await runListNumberLabels();

    expect(output).toBe(
      JSON.stringify({
        ok: true,
        labels: [
          { label: 'Trọng lượng hàng', unit: 'kg', count: 1 },
          { label: 'Trọng lượng hàng', unit: null, count: 1 },
        ],
      }),
    );
  });

  it('counts two copies of one ticket once', async () => {
    await insertTicketCopy();
    await insertTicketCopy();

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":1,"sum":"26380","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('takes the number of the newest copy of a ticket', async () => {
    await insertTicketCopy({ createdAt: new Date('2026-11-06T09:00:00+07:00'), details: [buildNumberDetail(26000, 'kg', 'Trọng lượng tịnh')] });
    await insertTicketCopy({ createdAt: new Date('2026-11-07T09:00:00+07:00') });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":1,"sum":"26380","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('takes the number of the copy with the highest record id when copies are saved at the same moment', async () => {
    const savedAt = new Date('2026-11-07T09:00:00+07:00');
    const copies: { id: string; weight: number }[] = [];
    for (const weight of [26001, 26002, 26003, 26004, 26005]) {
      const id = await insertTicketCopy({ createdAt: savedAt, details: [buildNumberDetail(weight, 'kg', 'Trọng lượng tịnh')] });
      copies.push({ id, weight });
    }
    const highestIdCopy = copies.reduce((highest, copy) => (copy.id > highest.id ? copy : highest));

    const output = JSON.parse(await runTotalNumbers('Trọng lượng tịnh')) as { groups: { count: number; sum: string }[] };

    expect(output.groups).toEqual([expect.objectContaining({ count: 1, sum: String(highestIdCopy.weight) })]);
  });

  it('counts the same document number on two plates as two tickets', async () => {
    await insertTicketCopy({ vehiclePlate: '93C04588' });
    await insertTicketCopy({ vehiclePlate: '93C01619' });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":2,"sum":"52760","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('counts the same document number on two document dates as two tickets', async () => {
    await insertTicketCopy({ occurredOn: '2026-11-05' });
    await insertTicketCopy({ occurredOn: '2026-11-06' });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":2,"sum":"52760","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('counts the same document number in two categories as two tickets', async () => {
    await insertTicketCopy({ category: 'nhận hàng' });
    await insertTicketCopy({ category: 'giao hàng' });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":2,"sum":"52760","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('counts two copies with no plate as one ticket', async () => {
    await insertTicketCopy({ vehiclePlate: null });
    await insertTicketCopy({ vehiclePlate: null });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":1,"sum":"26380","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('counts every record that has no document number', async () => {
    await insertTicketCopy({ documentNumber: null });
    await insertTicketCopy({ documentNumber: null });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":2,"sum":"52760","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('keeps a ticket whose newer copy lacks the label', async () => {
    await insertTicketCopy({ createdAt: new Date('2026-11-06T09:00:00+07:00') });
    await insertTicketCopy({ createdAt: new Date('2026-11-07T09:00:00+07:00'), details: [buildNumberDetail(26380, 'kg', 'Tịnh trọng cuối cùng')] });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":1,"sum":"26380","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('keeps a ticket whose newer copy is outside the text filter', async () => {
    const buildReceiverDetail = (factory: string) => ({ label: 'Nơi nhận', value: factory, number: null, unit: null });
    await insertTicketCopy({
      createdAt: new Date('2026-11-06T09:00:00+07:00'),
      details: [buildNumberDetail(26380, 'kg', 'Trọng lượng tịnh'), buildReceiverDetail('Cheng Loong')],
    });
    await insertTicketCopy({
      createdAt: new Date('2026-11-07T09:00:00+07:00'),
      details: [buildNumberDetail(26380, 'kg', 'Trọng lượng tịnh'), buildReceiverDetail('Chánh Dương')],
    });

    const output = await runTotalNumbers('Trọng lượng tịnh', 'none', { text: 'cheng loong' });

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":1,"sum":"26380","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('keeps a ticket whose newer copy is in another workspace', async () => {
    await insertTicketCopy({ createdAt: new Date('2026-11-06T09:00:00+07:00') });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    await insertTicketCopy({ workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy', createdAt: new Date('2026-11-07T09:00:00+07:00') });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe(
      '{"ok":true,"label":"Trọng lượng tịnh","groups":[{"group":null,"unit":"kg","count":1,"sum":"26380","min":"26380","max":"26380"}],"without_number":0}',
    );
  });

  it('counts a ticket once in without_number', async () => {
    const unreadWeight = { label: 'Trọng lượng tịnh', value: '26380', number: null, unit: null };
    await insertTicketCopy({ details: [unreadWeight] });
    await insertTicketCopy({ details: [unreadWeight] });

    const output = await runTotalNumbers('Trọng lượng tịnh');

    expect(output).toBe('{"ok":true,"label":"Trọng lượng tịnh","groups":[],"without_number":1}');
  });

  function insertTicketCopy(copy: Partial<NewRecordRow> = {}): Promise<string> {
    return insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      category: 'nhận hàng',
      documentNumber: '20261105054',
      vehiclePlate: '93C04588',
      occurredOn: '2026-11-05',
      details: [buildNumberDetail(26380, 'kg', 'Trọng lượng tịnh')],
      ...copy,
    });
  }

  function buildNumberDetail(number: number, unit = 'kg', label = 'Trọng lượng hàng') {
    return { label, value: `${number} ${unit}`, number, unit };
  }

  async function runListNumberLabels(filters: Filters = {}, scope: AccessScope = duy): Promise<string> {
    const args = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, occurred_from: null, occurred_to: null, ...filters };
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), invites: new CreatedInvites(), nameReview: new NameReviewRequest(), guard: new AdminTextGuard(false) };
    return runAdminTool(dependencies, scope, { id: 'call_1', name: 'list_number_labels', argumentsJson: JSON.stringify(args) });
  }

  async function runTotalNumbers(label: string, groupBy = 'none', filters: Filters = {}, scope: AccessScope = duy): Promise<string> {
    const args = { label, text: null, category: null, member: null, plate: null, added_from: null, added_to: null, occurred_from: null, occurred_to: null, ...filters, group_by: groupBy };
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), invites: new CreatedInvites(), nameReview: new NameReviewRequest(), guard: new AdminTextGuard(false) };
    return runAdminTool(dependencies, scope, { id: 'call_1', name: 'total_numbers', argumentsJson: JSON.stringify(args) });
  }
});
