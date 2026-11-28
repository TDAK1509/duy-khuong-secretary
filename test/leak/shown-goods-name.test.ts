import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type StoredEntry = { when_goods: string | null; when_pickup_name: string | null; then_shown_goods_name: string | null };

test('goods at a pickup company shown as a name saves as one entry', async () => {
  await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_goods: 'Than', when_pickup_company: 'Alpha', then_shown_goods: 'Than đá' }));
  assert.deepEqual(await listWorkspaceEntries(), [{ when_goods: 'Than', when_pickup_name: 'Alpha', then_shown_goods_name: 'Than đá' }]);
});

function saveArguments(given: Record<string, string>): Record<string, string | null> {
  return {
    statement: 'Hàng có chữ Than ở Alpha hiển thị là Than đá',
    entry_id: null,
    when_goods: null,
    when_pickup_company: null,
    when_dropoff_company: null,
    when_vehicle_plate: null,
    when_driver_member_id: null,
    then_customer: null,
    then_dropoff: null,
    then_shown_goods: null,
    then_wage_vnd: null,
    then_rate_vnd_per_ton: null,
    then_allowance_vnd: null,
    then_note: null,
    ...given,
  };
}

async function listWorkspaceEntries(): Promise<StoredEntry[]> {
  const { rows } = await databases.owner.query<StoredEntry>('SELECT when_goods, when_pickup_name, then_shown_goods_name FROM company_knowledge_entries WHERE workspace_id = $1 AND then_shown_goods_name IS NOT NULL', [WORKSPACE_A_ID]);
  return rows;
}
