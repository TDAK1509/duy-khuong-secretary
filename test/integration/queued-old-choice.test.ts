import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';
import { insertMember } from './workspace-rows.ts';

describe('a card queued by the old release is sent', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await insertMember(harness.database, {
      workspaceId: harness.workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
    });
  });

  afterEach(async () => {
    await harness.close();
  });

  async function queueCardWithOfferedChoice(kind: string): Promise<void> {
    const sourceEventId = await insertInboundEvent(harness.database, { externalUserId: 'zu-duy', text: 'Đặt lịch' });
    const messageId = await insertOutboundMessage(harness.database, { externalUserId: 'zu-duy', body: 'Lịch mới: Báo cáo' });
    const choice = JSON.stringify({
      kind,
      task_id: 't',
      workspace_id: harness.workspaceId,
      source_received_at: '2026-11-03T00:00:00Z',
      source_event_id: sourceEventId,
    });
    await harness.database.query(`UPDATE outbound_messages SET offered_choice = '${choice}'::jsonb WHERE id = '${messageId}'`);
  }

  it('stores no draft confirmation as the pending choice of the recipient', async () => {
    await queueCardWithOfferedChoice('draft_confirm');

    await harness.sendQueuedTexts();

    expect(await harness.database.query('SELECT status FROM outbound_messages')).toEqual([{ status: 'sent' }]);
    expect(await harness.database.query(`SELECT pending_choice FROM channel_identities WHERE external_user_id = 'zu-duy'`)).toEqual([
      { pending_choice: null },
    ]);
  });
});
