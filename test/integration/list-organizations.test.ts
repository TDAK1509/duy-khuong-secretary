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
import { insertOrganizationWithAlias } from './document-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type OrganizationsOutput = {
  ok: boolean;
  organizations: { name: string; type: string; aliases: string[]; document_count: number }[];
  next_cursor: string | null;
};

describe('the organization list of an admin', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('holds the first 50 companies by name and a cursor', async () => {
    await insertCompanies(51);

    const page = await runListOrganizations({ text: null, cursor: null });

    expect(page.organizations.map(({ name }) => name)).toEqual(buildCompanyNames(51).slice(0, 50));
    expect(page.next_cursor).not.toBeNull();
  });

  it('holds the rest of the companies and no cursor on the next page', async () => {
    await insertCompanies(51);
    const firstPage = await runListOrganizations({ text: null, cursor: null });

    const nextPage = await runListOrganizations({ text: null, cursor: firstPage.next_cursor });

    expect(nextPage.organizations.map(({ name }) => name)).toEqual(['Công ty 51']);
    expect(nextPage.next_cursor).toBeNull();
  });

  async function insertCompanies(count: number): Promise<void> {
    for (const name of buildCompanyNames(count)) await insertOrganizationWithAlias(database, { workspaceId, name });
  }

  function buildCompanyNames(count: number): string[] {
    return Array.from({ length: count }, (_, index) => `Công ty ${String(index + 1).padStart(2, '0')}`);
  }

  async function runListOrganizations(args: object, scope: AccessScope = duy): Promise<OrganizationsOutput> {
    const dependencies = {
      database: pool,
      clock: new FakeClock(new Date('2026-11-07T10:00:00+07:00')),
      attachments: new PhotoAttachments(),
      sources: new SourceCards(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      guard: new AdminTextGuard(false),
    };
    const output = await runAdminTool(dependencies, scope, { id: 'call_1', name: 'list_organizations', argumentsJson: JSON.stringify(args) });
    return JSON.parse(output) as OrganizationsOutput;
  }
});
