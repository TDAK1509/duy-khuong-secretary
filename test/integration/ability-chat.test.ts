import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAbilitySection } from '../../src/app/admin-chat/ability-section.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const ASK_ABILITIES = 'Bạn làm được gì?';
const INVITE_ABILITY_LINE = '- Tạo mã mời người mới vào nhóm.';

describe('the abilities the bot lists in a chat', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  });

  afterEach(async () => {
    await harness.close();
  });

  it('lists to a member the abilities of the tools in the request and no admin ability', async () => {
    await harness.receiveText('zu-hung', ASK_ABILITIES);

    const request = harness.chat.requests[0];
    expect(request?.system).toContain(buildAbilitySection(request?.tools ?? []));
    expect(request?.system).not.toContain(INVITE_ABILITY_LINE);
  });

  it('lists to an admin the abilities of the tools in the request', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });

    await harness.receiveText('zu-duy', ASK_ABILITIES);

    const request = harness.chat.requests[0];
    expect(request?.system).toContain(buildAbilitySection(request?.tools ?? []));
    expect(request?.system).toContain(INVITE_ABILITY_LINE);
  });
});
