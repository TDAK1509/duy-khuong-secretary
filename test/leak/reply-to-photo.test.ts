import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { NoCompanyMatchReader } from './support/no-company-match-reader.ts';
import { insertPhotoPaper, insertReplyMessage, insertSentPhoto, listPapersWithDropOff, readImageKey } from './support/photo-reply-rows.ts';
import { resetDatabase } from './support/reset-database.ts';
import { createToolHarness } from './support/tool-harness.ts';

const databases = openLeakDatabases();
const SHARED_PLATE = '51A00001';
const SHARED_DATE = '2026-03-02';
const NEW_DROP_OFF = 'Kho Moi Hai';

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test("a reply to a photo the bot sent changes only that photo's paper", async () => {
  const papers = await insertSharedPlatePapers(7);
  await insertSentPhoto(databases.owner, { imageKey: readImageKey('shared-3'), zaloMessageId: 'SENT-1' });
  const reply = await insertReplyMessage(databases.owner, { text: `cập nhật phiếu này: nơi đổ hàng ${NEW_DROP_OFF}`, quotedId: 'SENT-1' });
  const harness = createToolHarness(databases.runtime, { currentMessage: reply, companyReader: new NoCompanyMatchReader() });
  await harness.runTool('chat-gate', 'correct_document', buildCorrectionArguments({ company_slot: 'dropoff', company_name: NEW_DROP_OFF, current_plate: SHARED_PLATE, current_date: SHARED_DATE }));
  assert.deepEqual(await listPapersWithDropOff(databases.owner, NEW_DROP_OFF), [papers[2]!.paperId]);
});

async function insertSharedPlatePapers(count: number) {
  const papers = [];
  for (let index = 1; index <= count; index += 1) papers.push(await insertPhotoPaper(databases.owner, { key: `shared-${index}`, plate: SHARED_PLATE, date: SHARED_DATE }));
  return papers;
}

type Correction = Partial<{ new_plate: string; new_number: string; company_name: string; company_slot: 'dropoff'; last_photo: boolean; current_plate: string; current_number: string; current_date: string }>;

function buildCorrectionArguments(correction: Correction): object {
  return {
    new_plate: null, new_number: null, new_date: null, new_stage: null,
    printed_label: null, printed_value: null, printed_meaning: null, printed_number: null, printed_unit: null,
    company_slot: null, company_name: null, last_photo: false,
    current_plate: null, current_number: null, current_date: null, all_matching: false,
    ...correction,
  };
}
