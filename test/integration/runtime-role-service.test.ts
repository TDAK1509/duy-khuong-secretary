import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, NOW, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the service connected as the runtime role', () => {
  describe('when two drivers send the same paper', () => {
    let harness: IntakeHarness;

    beforeEach(async () => {
      harness = await createIntakeHarness();
      harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
      await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    });

    afterEach(async () => {
      await harness.close();
    });

    it('still sees the record of another driver in the duplicate check', async () => {
      const fuel = makeItem({ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234' });
      for (const reader of [...harness.readers.cheap]) reader.answerWith(makeReading([fuel]));
      await harness.receivePhoto('zu-hung');
      await harness.sendQueuedTexts();
      harness.channel.texts.splice(0);

      await harness.receivePhoto('zu-lan');
      await harness.sendQueuedTexts();

      expect(harness.channel.texts.map((sent) => sent.to.externalUserId)).toEqual(['zu-lan']);
      expect(await harness.database.query('SELECT 1 FROM records')).toHaveLength(1);
    });
  });

  describe('when an admin searches', () => {
    let database: TemporaryDatabase;
    let pool: PostgresPool;

    beforeEach(async () => {
      database = await createMigratedDatabase();
      pool = createPostgresPool(database.runtimeUrl);
    });

    afterEach(async () => {
      await pool.end();
      await database.drop();
    });

    it('still sees every sender\'s records', async () => {
      const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
      const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
      for (const [externalUserId, displayName] of [['zu-hung', 'Hùng'], ['zu-lan', 'Lan']] as const) {
        const userId = await insertMember(database, { workspaceId, externalUserId, displayName });
        await insertRecordRow(database, { workspaceId, userId, senderName: displayName });
        await insertRecordRow(database, { workspaceId, userId, senderName: displayName });
      }
      const duy: AccessScope = { workspaceId, userId: duyUserId, role: 'admin' };
      const filters = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null };

      const output = await runAdminTool(
        { database: pool, clock: new FakeClock(NOW), attachments: new PhotoAttachments(), created: new CreatedTasks(null) },
        duy,
        { id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(filters) },
      );

      expect((JSON.parse(output) as { items: unknown[] }).items).toHaveLength(4);
    });
  });
});
