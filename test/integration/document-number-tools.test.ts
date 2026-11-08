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
import { insertOrganizationWithAlias } from './document-rows.ts';
import { insertAnotherSource, insertNumberedDocument, insertNumberLine, insertParty } from './document-number-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type TotalArguments = Record<string, string | null>;

type TotalOutput = {
  ok: boolean;
  groups: { group: string | null; unit: string; count: number; sum: string; min: string; max: string }[];
};

describe('the document number tools of an admin', () => {
  const clock = new FakeClock(new Date('2026-11-07T10:00:00+07:00'));
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let hungUserId: string;
  let chengLoongId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
    chengLoongId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Công ty TNHH Cheng Loong Bình Dương Paper' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('counts a document once however many photos show it', async () => {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0001' });
    await insertAnotherSource(database, { workspaceId, userId: hungUserId, documentId });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'Trọng lượng hàng', number: 26380, unit: 'kg' });
    await insertParty(database, { workspaceId, documentId, role: 'customer', organizationId: chengLoongId, printedName: 'Cheng Loong' });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('counts a document once when the same company appears in two roles', async () => {
    const documentId = await insertWeighing({ documentNumber: '0002', netKg: 26380 });
    await insertParty(database, { workspaceId, documentId, role: 'issuer', organizationId: chengLoongId, printedName: 'Cheng Loong' });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper', role: null });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('leaves out the port ticket of the same load when the stage is receipt', async () => {
    await insertWeighing({ documentNumber: '0003', netKg: 26380, stage: 'receipt' });
    await insertWeighing({ documentNumber: '0004', netKg: 26470, stage: 'dispatch' });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper', stage: 'receipt' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  async function insertWeighing(row: { documentNumber: string; netKg: number; stage?: 'dispatch' | 'receipt' }): Promise<string> {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: row.documentNumber, stage: row.stage });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'Trọng lượng hàng', number: row.netKg, unit: 'kg' });
    await insertParty(database, { workspaceId, documentId, role: 'customer', organizationId: chengLoongId, printedName: 'Cheng Loong' });
    return documentId;
  }

  async function runTotal(overrides: TotalArguments = {}, scope: AccessScope = duy): Promise<TotalOutput> {
    const args = {
      meaning: 'Trọng lượng hàng',
      lines: 'document',
      organization: null,
      role: null,
      stage: null,
      kind: null,
      plate: null,
      date_meaning: null,
      date_from: null,
      date_to: null,
      group_by: 'none',
      ...overrides,
    };
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), invites: new CreatedInvites(), nameReview: new NameReviewRequest(), guard: new AdminTextGuard(false) };
    const output = await runAdminTool(dependencies, scope, { id: 'call_1', name: 'total_document_numbers', argumentsJson: JSON.stringify(args) });
    return JSON.parse(output) as TotalOutput;
  }
});
