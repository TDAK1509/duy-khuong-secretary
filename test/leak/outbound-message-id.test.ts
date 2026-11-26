import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { queueOutboundImage, readOutboundRow, runOutboundDeliveryStep } from './support/outbound-delivery-step.ts';
import { resetDatabase } from './support/reset-database.ts';

const databases = openLeakDatabases();
const OUTBOUND_ID = 'aaaaaaaa-0099-4000-8000-000000000001';

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('a sent outbound image stores its Zalo message id', async () => {
  await queueOutboundImage(databases.owner, OUTBOUND_ID);
  await runOutboundDeliveryStep({ owner: databases.owner, step: databases.runtime }, { ok: true, messageId: 'SENT-1' });
  assert.deepEqual(await readOutboundRow(databases.owner, OUTBOUND_ID), { status: 'sent', external_message_id: 'SENT-1' });
});
