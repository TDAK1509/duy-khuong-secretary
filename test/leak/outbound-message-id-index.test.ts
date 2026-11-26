import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';

const databases = openLeakDatabases();

after(() => databases.close());

test('outbound messages have a partial non-unique index on the Zalo message id', async () => {
  const { rows } = await databases.owner.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE tablename = 'outbound_messages' AND indexname = 'outbound_messages_external_message_id_idx'`,
  );
  assert.equal(rows.length, 1);
  const definition = rows[0]?.indexdef ?? '';
  assert.match(definition, /^CREATE INDEX /);
  assert.match(definition, /\(channel, account_id, external_user_id, external_message_id\)/);
  assert.match(definition, /WHERE \(external_message_id IS NOT NULL\)$/);
});
