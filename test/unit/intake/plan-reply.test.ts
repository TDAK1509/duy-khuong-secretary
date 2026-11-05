import { describe, expect, it } from 'vitest';
import { ASK_AGAIN_TEXT, ASK_EXPLANATION_TEXT, UPLOAD_ONLY_TEXT } from '../../../src/app/intake/intake-texts.ts';
import { planAnswer, planReply } from '../../../src/app/intake/plan-reply.ts';
import type { AskedPhoto } from '../../../src/app/intake/waiting-photos.ts';
import type { ReadingDecision } from '../../../src/app/reading/decide-reading.ts';
import type { Reading } from '../../../src/app/reading/reading.ts';
import { makeItem, makeReading, succeed } from '../reading/make-reading.ts';

function agreeOn(reading: Reading): ReadingDecision {
  return { outcome: 'cheap_pair', cheap: [succeed(reading), succeed(reading)], strong: null, agreed: [reading, reading] };
}

describe('planReply', () => {
  const unclear = makeReading([], { has_work_data: false, needs_explanation: true });

  it('saves nothing when both readers say the photo needs an explanation', () => {
    const plan = planReply(agreeOn(unclear), true);

    expect(plan).toMatchObject({ saved: null, status: 'needs_explanation', replyText: ASK_EXPLANATION_TEXT });
  });

  it('does not ask for an explanation of a message that has no photo', () => {
    const plan = planReply(agreeOn(unclear), false);

    expect(plan).toMatchObject({ saved: null, status: 'accepted', replyText: UPLOAD_ONLY_TEXT });
  });
});

describe('planReply unclear readings', () => {
  const tireOfPlate = (plate: string) => makeReading([makeItem({ maintenance_item: 'lốp', vehicle_plate: plate })]);

  it('is unclear when the readers disagree and every reader answered', () => {
    const [first, second] = [tireOfPlate('29C-123.45'), tireOfPlate('29C-123.46')];
    const decision: ReadingDecision = {
      outcome: 'unresolved',
      cheap: [succeed(first), succeed(second)],
      strong: [succeed(first), succeed(second)],
      agreed: null,
    };

    const plan = planReply(decision, false);

    expect(plan.isUnclear).toBe(true);
  });

  it('is not unclear when a reader did not answer', () => {
    const reading = tireOfPlate('29C-123.45');
    const decision: ReadingDecision = {
      outcome: 'unresolved',
      cheap: [succeed(reading), succeed(tireOfPlate('29C-123.46'))],
      strong: [succeed(reading), { ok: false, reason: 'timeout' }],
      agreed: null,
    };

    const plan = planReply(decision, false);

    expect(plan.isUnclear).toBe(false);
  });
});

describe('planAnswer', () => {
  const asked: AskedPhoto = { id: 'photo-1', imageKey: 'w/photo-1.jpg', status: 'needs_explanation' };
  const question = makeReading([], { has_work_data: false, has_question: true });
  const tireAndQuestion = makeReading([makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45' })], {
    has_question: true,
  });

  it('plans a question for an admin answer that asks and has no items', () => {
    const plan = planAnswer(agreeOn(question), asked, 'admin');

    expect(plan).toEqual({ kind: 'question' });
  });

  it('plans a save for an admin answer that has items and asks', () => {
    const plan = planAnswer(agreeOn(tireAndQuestion), asked, 'admin');

    expect(plan).toMatchObject({ kind: 'reply', photoAfter: 'same_as_reply', reply: { situation: 'saved', asksQuestion: true } });
  });

  it('plans to ask again for a member answer that asks and has no items', () => {
    const plan = planAnswer(agreeOn(question), asked, 'member');

    expect(plan).toMatchObject({ kind: 'reply', photoAfter: 'asked_again', reply: { replyText: ASK_AGAIN_TEXT } });
  });
});
