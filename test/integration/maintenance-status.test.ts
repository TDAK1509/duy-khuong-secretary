import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type StatusFilters = Partial<Record<'plate' | 'maintenance_item' | 'cursor', string>>;

type StatusRow = {
  record_id: string;
  plate: string;
  maintenance_item: string;
  sent_by: string;
  sent_on: string;
  occurred_on: string | null;
  days_since_sent: number;
  summary: string;
};

type StatusResult = { items: StatusRow[]; next_cursor: string | null };

describe('the maintenance status tool of an admin', () => {
  let clock: FakeClock;
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let hungUserId: string;
  let lanUserId: string;

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-02T10:00:00+07:00'));
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  async function runStatusOutput(filters: StatusFilters = {}, scope: AccessScope = duy): Promise<string> {
    const args = { plate: null, maintenance_item: null, cursor: null, ...filters };
    return runAdminTool({ database: pool, clock }, scope, { id: 'call_1', name: 'maintenance_status', argumentsJson: JSON.stringify(args) });
  }

  async function runStatus(filters: StatusFilters = {}, scope: AccessScope = duy): Promise<StatusResult> {
    return JSON.parse(await runStatusOutput(filters, scope)) as StatusResult;
  }

  it('reads only maintenance records', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'fuel', vehiclePlate: '29C12345' });
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      category: 'maintenance',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '29C12345',
    });

    const result = await runStatus();

    expect(result.items.map((row) => [row.plate, row.maintenance_item])).toEqual([['29C12345', 'dầu máy']]);
  });

  it('keeps the newest record of a truck, whoever sent it', async () => {
    const maintenance = { workspaceId, category: 'maintenance', maintenanceItem: 'dầu máy', vehiclePlate: '29C12345' };
    await insertRecordRow(database, { ...maintenance, userId: hungUserId, senderName: 'Hùng', createdAt: new Date('2026-09-01T10:00:00+07:00') });
    await insertRecordRow(database, { ...maintenance, userId: lanUserId, senderName: 'Lan', createdAt: new Date('2026-10-01T10:00:00+07:00') });

    const result = await runStatus();

    expect(result.items.map((row) => [row.sent_by, row.sent_on])).toEqual([['Lan', '2026-10-01']]);
  });

  it('gives one row per truck', async () => {
    const maintenance = { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'maintenance', maintenanceItem: 'dầu máy' };
    await insertRecordRow(database, { ...maintenance, vehiclePlate: '29C12345' });
    await insertRecordRow(database, { ...maintenance, vehiclePlate: '51D67890' });

    const result = await runStatus();

    expect(result.items.map((row) => row.plate)).toEqual(['29C12345', '51D67890']);
  });

  it('gives one row per part of a truck', async () => {
    const maintenance = { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'maintenance', vehiclePlate: '29C12345' };
    await insertRecordRow(database, { ...maintenance, maintenanceItem: 'dầu máy' });
    await insertRecordRow(database, { ...maintenance, maintenanceItem: 'lốp' });

    const result = await runStatus();

    expect(result.items.map((row) => [row.plate, row.maintenance_item])).toEqual([['29C12345', 'dầu máy'], ['29C12345', 'lốp']]);
  });

  it('filters by plate, ignoring punctuation and case', async () => {
    const maintenance = { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'maintenance', maintenanceItem: 'dầu máy' };
    await insertRecordRow(database, { ...maintenance, vehiclePlate: '29C12345' });
    await insertRecordRow(database, { ...maintenance, vehiclePlate: '51D67890' });

    const result = await runStatus({ plate: '29c-123.45' });

    expect(result.items.map((row) => row.plate)).toEqual(['29C12345']);
  });

  it('filters by part, ignoring accents and case', async () => {
    const maintenance = { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'maintenance', vehiclePlate: '29C12345' };
    await insertRecordRow(database, { ...maintenance, maintenanceItem: 'dầu máy' });
    await insertRecordRow(database, { ...maintenance, maintenanceItem: 'lốp' });

    const result = await runStatus({ maintenance_item: 'Dau May' });

    expect(result.items.map((row) => row.maintenance_item)).toEqual(['dầu máy']);
  });

  it('counts the days since sending in Vietnam dates', async () => {
    clock = new FakeClock(new Date('2026-10-31T08:00:00+07:00'));
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      category: 'maintenance',
      maintenanceItem: 'dầu máy',
      createdAt: new Date('2026-10-01T23:30:00+07:00'),
    });

    const result = await runStatus();

    expect(result.items.map((row) => [row.sent_on, row.days_since_sent])).toEqual([['2026-10-01', 30]]);
  });
});
