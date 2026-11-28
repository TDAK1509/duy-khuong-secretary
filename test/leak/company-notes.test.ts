import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertPaper } from './support/paper-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type NoteEntry = { id: string; links: number };

test('a note with no condition saves and links no paper', async () => {
  for (const number of ['1', '2', '3']) await insertPaper(databases.owner, { stage: 'dispatch', plate: `51C1234${number}`, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await callChatTool(databases.runtime, 'save_company_knowledge', saveNoteArguments('cân lại ở trạm'));
  const entries = await listNoteEntries('cân lại ở trạm');
  assert.deepEqual(entries.map((entry) => entry.links), [0]);
});

function saveNoteArguments(note: string): Record<string, string | null> {
  return {
    statement: note,
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
    then_note: note,
  };
}

async function listNoteEntries(note: string): Promise<NoteEntry[]> {
  const { rows } = await databases.owner.query<NoteEntry>(
    `SELECT entry.id, (SELECT count(*)::int FROM company_knowledge_links link WHERE link.entry_id = entry.id) AS links
     FROM company_knowledge_entries entry WHERE entry.workspace_id = $1 AND entry.then_note = $2`,
    [WORKSPACE_A_ID, note],
  );
  return rows;
}
