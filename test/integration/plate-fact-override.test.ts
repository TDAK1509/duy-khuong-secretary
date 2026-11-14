import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { storeDocuments } from '../../src/app/documents/store-documents.ts';
import type { ReplyPlan } from '../../src/app/intake/plan-reply.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertChatMessage } from './message-rows.ts';
import { insertMemberFact } from './member-fact-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
import { buildNewRecords } from '../../src/app/records/new-record.ts';

describe('plate fact override in storeDocuments', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy');
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('stores the document with the plate from the fact when the sender has a plate fact', async () => {
    const driverUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-driver', displayName: 'Tài xế 93C12346' });
    await insertMemberFact(database, { workspaceId, memberUserId: driverUserId, authorUserId: null, readers: 'admins_and_member', fact: 'Biển số xe: 93C12346' });
    const messageId = await insertChatMessage(database, { workspaceId, userId: driverUserId, author: 'user', text: null, imageKey: 'test.jpg', createdAt: new Date() });
    const plan = makePlan('93C12344');
    const sender = { userId: driverUserId, role: 'member' as const };

    await runInTransaction(pool, (transaction) =>
      storeDocuments(transaction, { id: messageId, workspaceId }, plan, true, sender),
    );

    const [row] = await database.query<{ vehicle_plate: string }>('SELECT vehicle_plate FROM documents');
    expect(row?.vehicle_plate).toBe('93C12346');
  });

  it('keeps the reader plate when the driver has no plate fact', async () => {
    const driverUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-driver', displayName: 'Tài xế 93C12346' });
    const messageId = await insertChatMessage(database, { workspaceId, userId: driverUserId, author: 'user', text: null, imageKey: 'test.jpg', createdAt: new Date() });
    const plan = makePlan('93C12344');
    const sender = { userId: driverUserId, role: 'member' as const };

    await runInTransaction(pool, (transaction) =>
      storeDocuments(transaction, { id: messageId, workspaceId }, plan, true, sender),
    );

    const [row] = await database.query<{ vehicle_plate: string }>('SELECT vehicle_plate FROM documents');
    expect(row?.vehicle_plate).toBe('93C12344');
  });

  it('does not override the reader when display_name looks like a plate but no fact is stored', async () => {
    const driverUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-driver', displayName: 'Tài xế 93C12346' });
    const messageId = await insertChatMessage(database, { workspaceId, userId: driverUserId, author: 'user', text: null, imageKey: 'test.jpg', createdAt: new Date() });
    const plan = makePlan('93C12344');
    const sender = { userId: driverUserId, role: 'member' as const };

    await runInTransaction(pool, (transaction) =>
      storeDocuments(transaction, { id: messageId, workspaceId }, plan, true, sender),
    );

    const [row] = await database.query<{ vehicle_plate: string }>('SELECT vehicle_plate FROM documents');
    expect(row?.vehicle_plate).toBe('93C12344');
  });

  it('uses the fact plate even when display_name holds a different plate-looking token', async () => {
    const driverUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-driver', displayName: 'Tài xế 51A-11111' });
    await insertMemberFact(database, { workspaceId, memberUserId: driverUserId, authorUserId: null, readers: 'admins_and_member', fact: 'Biển số xe: 93A-22222' });
    const messageId = await insertChatMessage(database, { workspaceId, userId: driverUserId, author: 'user', text: null, imageKey: 'test.jpg', createdAt: new Date() });
    const plan = makePlan('72B-33333');
    const sender = { userId: driverUserId, role: 'member' as const };

    await runInTransaction(pool, (transaction) =>
      storeDocuments(transaction, { id: messageId, workspaceId }, plan, true, sender),
    );

    const [row] = await database.query<{ vehicle_plate: string }>('SELECT vehicle_plate FROM documents');
    expect(row?.vehicle_plate).toBe('93A-22222');
  });
});

function makePlan(vehiclePlate: string): ReplyPlan {
  const item = makeItem({ category: 'đổ xăng dầu', vehicle_plate: vehiclePlate, occurred_on: '2026-11-01' });
  const reading = makeReading([item]);
  const records = buildNewRecords(reading.items);
  return {
    replyText: 'ok',
    replyKind: 'saved',
    status: 'accepted',
    saved: records,
    readItems: reading.items,
    situation: 'saved',
    asksQuestion: false,
    isUnclear: false,
  };
}
