import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { findAttackCase } from './support/attack-cases.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_DOCUMENT_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('the save_fact attack case adds a fact in A and links it to the A document', async () => {
  const output = JSON.parse(await callChatTool(databases.runtime, 'save_fact', findAttackCase('save_fact').arguments)) as Record<string, unknown>;
  assert.equal(output['action'], 'added');
  assert.equal(output['linked_documents'], 1);
  const { rows } = await databases.owner.query<{ document_id: string }>('SELECT document_id FROM document_facts WHERE fact_id = $1', [output['fact_id']]);
  assert.deepEqual(rows, [{ document_id: A_DOCUMENT_ID }]);
});
