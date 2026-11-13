import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertMemberMemory } from './member-memory-rows.ts';

const PLATE_FACT = 'Lái xe biển số 93A-1234';
const RULE_18_WITH_PLATE_FACT = '18. Thông tin quản lý đã lưu về người gửi: ["Lái xe biển số 93A-1234"]. Danh sách này';

describe('giving the reader the facts saved about the sender', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertMemberMemory(harness.database, { workspaceId: harness.workspaceId, userId: harness.hungUserId, markdown: `- ${PLATE_FACT}` });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('shows the reader the facts of the member when the member sends a photo', async () => {
    await harness.receivePhoto('zu-hung');

    const [request] = harness.reader.requests;
    expect(request?.system).toContain(RULE_18_WITH_PLATE_FACT);
  });
});
