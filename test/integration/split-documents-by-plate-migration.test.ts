import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as splitDocumentsByPlate } from '../../src/app/db/migrations/0039_split_documents_by_plate.ts';
import { insertDocumentWithSource, type NewDocumentRow } from './document-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migration that splits documents by plate', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
  });

  afterEach(async () => {
    await database.drop();
  });

  it('accepts a waiting document whose plate differs from the accepted one', async () => {
    await insertPortDocument('93C04588', 'accepted');
    await insertPortDocument('93C04258', 'needs_review');

    await runMigration();

    expect(await database.query('SELECT vehicle_plate, status FROM documents ORDER BY vehicle_plate')).toEqual([
      { vehicle_plate: '93C04258', status: 'accepted' },
      { vehicle_plate: '93C04588', status: 'accepted' },
    ]);
  });

  it('leaves a waiting document with the same plate as an accepted one waiting', async () => {
    await insertPortDocument('93C04588', 'accepted');
    await insertPortDocument('93C04588', 'needs_review');

    await runMigration();

    expect(await database.query('SELECT vehicle_plate, status FROM documents ORDER BY status')).toEqual([
      { vehicle_plate: '93C04588', status: 'accepted' },
      { vehicle_plate: '93C04588', status: 'needs_review' },
    ]);
  });

  it('accepts only the earliest of two waiting documents with the same plate', async () => {
    const earliestId = await insertPortDocument('93C04588', 'needs_review');
    const laterId = await insertPortDocument('93C04588', 'needs_review');

    await runMigration();

    expect(await database.query('SELECT id, status FROM documents ORDER BY created_at, id')).toEqual([
      { id: earliestId, status: 'accepted' },
      { id: laterId, status: 'needs_review' },
    ]);
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    splitDocumentsByPlate({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    for (const statement of statements) await database.query(statement);
  }

  function insertPortDocument(vehiclePlate: string, status: NewDocumentRow['status']): Promise<string> {
    return insertDocumentWithSource(database, {
      workspaceId,
      userId,
      issuerKey: 'congtycpcangvanangluongbinhduong',
      documentNumber: 'CAU',
      documentDate: '2026-11-05',
      vehiclePlate,
      status,
    });
  }
});
