import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { readMemberFacts } from './member-fact-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
import { insertDocumentWithSource } from './document-rows.ts';

const MEMBER_NOT_FOUND_RESULT = '{"ok":false,"error":"Không tìm thấy người này."}';

describe('rewrite_member_plate tool', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let duyUserId: string;
  let hungUserId: string;
  let hungMembershipId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    hungMembershipId = await findMembershipId(hungUserId);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('updates every document from that member whose plate differs', async () => {
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik1', documentNumber: 'D1', documentDate: '2026-11-01', vehiclePlate: '93C12344' });
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik2', documentNumber: 'D2', documentDate: '2026-11-01', vehiclePlate: '93C12344' });
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik3', documentNumber: 'D3', documentDate: '2026-11-01', vehiclePlate: '93C12346' });

    await runTool({ member_id: hungMembershipId, vehicle_plate: '93C12346' });

    const plates = await database.query<{ vehicle_plate: string | null }>(`SELECT vehicle_plate FROM documents ORDER BY document_number`);
    expect(plates.map((r) => r.vehicle_plate)).toEqual(['93C12346', '93C12346', '93C12346']);
  });

  it('reports the number of rows it changed', async () => {
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik1', documentNumber: 'D1', documentDate: '2026-11-01', vehiclePlate: '93C12344' });
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik2', documentNumber: 'D2', documentDate: '2026-11-01', vehiclePlate: '93C12344' });
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik3', documentNumber: 'D3', documentDate: '2026-11-01', vehiclePlate: '93C12346' });

    const output = await runTool({ member_id: hungMembershipId, vehicle_plate: '93C12346' });

    expect(JSON.parse(output)).toMatchObject({ ok: true, updated: 2 });
  });

  it('saves a plate fact on the driver with the admin as author', async () => {
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik1', documentNumber: 'D1', documentDate: '2026-11-01', vehiclePlate: '93C12344' });

    await runTool({ member_id: hungMembershipId, vehicle_plate: '93C12346' });

    const facts = await database.query<{ fact: string; readers: string; author_user_id: string }>(
      `SELECT fact, readers, author_user_id FROM member_facts WHERE member_user_id = '${hungUserId}'`,
    );
    expect(facts).toEqual([{ fact: 'Biển số xe: 93C12346', readers: 'admins_and_member', author_user_id: duyUserId }]);
  });

  it('does not touch documents from other members', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik1', documentNumber: 'D1', documentDate: '2026-11-01', vehiclePlate: '93C12344' });
    await insertDocumentWithSource(database, { workspaceId, userId: lanUserId, issuerKey: 'ik2', documentNumber: 'D2', documentDate: '2026-11-01', vehiclePlate: '93C12344' });

    await runTool({ member_id: hungMembershipId, vehicle_plate: '93C12346' });

    const rows = await database.query<{ vehicle_plate: string | null; document_number: string }>(`SELECT vehicle_plate, document_number FROM documents ORDER BY document_number`);
    expect(rows).toEqual([
      { vehicle_plate: '93C12346', document_number: 'D1' },
      { vehicle_plate: '93C12344', document_number: 'D2' },
    ]);
  });

  it('does not touch documents from other workspaces', async () => {
    const w2Id = await insertWorkspace(database, 'Xe tải khác');
    const a2UserId = await insertMember(database, { workspaceId: w2Id, externalUserId: 'zu-a2', displayName: 'A2', role: 'admin' });
    const d2UserId = await insertMember(database, { workspaceId: w2Id, externalUserId: 'zu-d2', displayName: 'D2' });
    const d2MembershipId = await findMembershipId(d2UserId);

    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik1', documentNumber: 'D1', documentDate: '2026-11-01', vehiclePlate: '93C12344' });
    await insertDocumentWithSource(database, { workspaceId: w2Id, userId: d2UserId, issuerKey: 'ik2', documentNumber: 'D2', documentDate: '2026-11-01', vehiclePlate: '93C12344' });

    await runTool({ member_id: hungMembershipId, vehicle_plate: '93C12346' });

    const w2Plates = await database.query<{ vehicle_plate: string | null }>(`SELECT vehicle_plate FROM documents WHERE workspace_id = '${w2Id}'`);
    expect(w2Plates.map((r) => r.vehicle_plate)).toEqual(['93C12344']);
  });

  it('reports zero updated and no duplicate fact on a second call with the same plate', async () => {
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik1', documentNumber: 'D1', documentDate: '2026-11-01', vehiclePlate: '93C12344' });
    await runTool({ member_id: hungMembershipId, vehicle_plate: '93C12346' });

    const output = await runTool({ member_id: hungMembershipId, vehicle_plate: '93C12346' });

    expect(JSON.parse(output)).toMatchObject({ ok: true, updated: 0 });
    const facts = await database.query<{ id: string }>(`SELECT id FROM member_facts WHERE member_user_id = '${hungUserId}'`);
    expect(facts).toHaveLength(1);
  });

  it('refuses an unknown member id', async () => {
    const output = await runTool({ member_id: '00000000-0000-0000-0000-000000000000', vehicle_plate: '93C12346' });

    expect(output).toBe(MEMBER_NOT_FOUND_RESULT);
    expect(await database.query('SELECT 1 FROM documents')).toHaveLength(0);
  });

  it('refuses an invalid plate and makes no changes', async () => {
    await insertDocumentWithSource(database, { workspaceId, userId: hungUserId, issuerKey: 'ik1', documentNumber: 'D1', documentDate: '2026-11-01', vehiclePlate: '93C12344' });

    const output = await runTool({ member_id: hungMembershipId, vehicle_plate: 'abc123' });

    expect(JSON.parse(output)).toMatchObject({ ok: false });
    const plates = await database.query<{ vehicle_plate: string | null }>(`SELECT vehicle_plate FROM documents`);
    expect(plates.map((r) => r.vehicle_plate)).toEqual(['93C12344']);
  });

  async function findMembershipId(userId: string): Promise<string> {
    const [row] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${userId}'`);
    if (!row) throw new Error(`no membership for ${userId}`);
    return row.id;
  }

  async function runTool(args: object, scope: AccessScope = duy): Promise<string> {
    const dependencies = {
      database: pool,
      clock: new FakeClock(new Date('2026-11-14T10:00:00+07:00')),
      attachments: new PhotoAttachments(),
      sources: new SourceCards(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      guard: new AdminTextGuard(false),
    };
    return runAdminTool(dependencies, scope, { id: 'call_1', name: 'rewrite_member_plate', argumentsJson: JSON.stringify(args) });
  }
});
