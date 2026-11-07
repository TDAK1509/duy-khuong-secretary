import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertMember } from './workspace-rows.ts';

describe('giving the reader the labels of the workspace', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertRecordRow(database, {
      workspaceId,
      userId: lanUserId,
      senderName: 'Lan',
      details: [{ label: 'Trọng lượng hàng', value: '27.420 kg' }],
    });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('shows the reader the labels saved by the other members when a member sends a text', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 1.250.000đ');

    const [request] = harness.reader.requests;
    expect(request?.system).toContain('10c. Các nhãn nhóm này đã dùng, dùng nhiều nhất trước: ["Trọng lượng hàng"].');
  });
});
