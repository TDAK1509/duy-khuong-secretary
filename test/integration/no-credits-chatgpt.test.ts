import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveRecordFromText } from '../../src/app/chatgpt/save-record-from-text.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { setCreditBalance } from './llm-call-rows.ts';
import { insertMember } from './workspace-rows.ts';

const CHATGPT_OUT_OF_CREDIT_TEXT = 'Chưa lưu vì nhóm đã hết credit. Quản lý nhóm cần liên hệ bên cung cấp Trợ lý để nạp thêm credit.';

describe('the ChatGPT text save of a workspace with no credits', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await setCreditBalance(harness.database, harness.workspaceId, 0);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is refused, reads nothing and stores nothing', async () => {
    const duyId = await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const chatGptReader = new FakeReader();
    const runtime = { database: harness.pool, clock: harness.clock, reader: chatGptReader, maxTextLength: 2000 };

    const result = await saveRecordFromText(runtime, { workspaceId: harness.workspaceId, userId: duyId, role: 'admin' }, { text: 'Đổ dầu 500.000đ' });

    expect(result).toEqual({ text: CHATGPT_OUT_OF_CREDIT_TEXT, isError: true });
    expect(chatGptReader.requests).toEqual([]);
    expect(await harness.database.query('SELECT 1 FROM messages')).toEqual([]);
  });
});
