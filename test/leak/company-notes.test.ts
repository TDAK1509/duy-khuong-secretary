import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { answerAdminQuestion, playAdminTurn } from './support/admin-chat-session.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry, insertPaper } from './support/paper-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';
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

test('the admin chat context lists a note with its author and conditions', async () => {
  await insertEntry(databases.owner, { pickup: 'Alpha', note: 'cân lại ở trạm' });
  assert.ok((await readCompanyRules()).includes('- SAFE-A-ADMIN: lấy hàng ở Alpha: cân lại ở trạm'));
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

async function readCompanyRules(): Promise<string> {
  const model = new ScriptedChatModel([]);
  const played = await playAdminTurn({ owner: databases.owner, database: databases.runtime, chat: model, text: 'công ty có những ghi chú nào?', turnNumber: 1 }, answerAdminQuestion);
  if (played.crash !== null) throw played.crash;
  const [contextTurn] = model.requests[0]?.turns ?? [];
  if (contextTurn?.role !== 'user' || contextTurn.text === null) throw new Error('the model received no user turn');
  return contextTurn.text.match(/<retrieved-data source="company-rules">\n([\s\S]*?)\n<\/retrieved-data>/)?.[1] ?? '';
}
