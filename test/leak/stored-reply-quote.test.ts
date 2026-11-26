import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { storeInboundEvent, type StorableEvent } from '../../src/app/processing/store-inbound-event.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { FIXED_NOW } from './support/seed-ids.ts';
import { resetDatabase } from './support/reset-database.ts';

const databases = openLeakDatabases();
const FROM = { channel: 'zalo-oa', accountId: 'seed-oa', externalUserId: 'seed-zalo-admin-a' };

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('a stored reply event keeps the quote id in its payload', async () => {
  const event: StorableEvent = { kind: 'text', eventId: 'QUOTE-EVENT-1', from: FROM, text: 'cập nhật phiếu này', quoteMessageId: 'QUOTED-1', sentAt: FIXED_NOW };
  await storeAsRuntime(event);
  assert.equal((await readStoredPayload('QUOTE-EVENT-1')).quote_msg_id, 'QUOTED-1');
});

test('a stored text without a quote has no quote id key', async () => {
  const event: StorableEvent = { kind: 'text', eventId: 'QUOTE-EVENT-2', from: FROM, text: 'xin chào', sentAt: FIXED_NOW };
  await storeAsRuntime(event);
  assert.equal('quote_msg_id' in (await readStoredPayload('QUOTE-EVENT-2')), false);
});

function storeAsRuntime(event: StorableEvent): Promise<void> {
  return runInTransaction(databases.runtime, (transaction) => storeInboundEvent(transaction, event));
}

async function readStoredPayload(eventId: string): Promise<Record<string, unknown>> {
  const { rows } = await databases.owner.query<{ payload: Record<string, unknown> }>(
    'SELECT payload FROM inbound_events WHERE external_event_id = $1',
    [eventId],
  );
  assert.equal(rows.length, 1);
  return rows[0]?.payload ?? {};
}
