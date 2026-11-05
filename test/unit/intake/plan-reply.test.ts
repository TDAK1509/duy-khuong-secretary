import { describe, expect, it } from 'vitest';
import { ASK_EXPLANATION_TEXT, UPLOAD_ONLY_TEXT } from '../../../src/app/intake/intake-texts.ts';
import { planAnswer, planReply } from '../../../src/app/intake/plan-reply.ts';
import type { AskedPhoto } from '../../../src/app/intake/waiting-photos.ts';
import type { ReadingDecision } from '../../../src/app/reading/decide-reading.ts';
import type { Reading } from '../../../src/app/reading/reading.ts';
import { makeReading, succeed } from '../reading/make-reading.ts';

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

describe('planAnswer', () => {
  const asked: AskedPhoto = { id: 'photo-1', imageKey: 'w/photo-1.jpg', status: 'needs_explanation' };
  const question = makeReading([], { has_work_data: false, has_question: true });

  it('plans a question for an admin answer that asks and has no items', () => {
    const plan = planAnswer(agreeOn(question), asked, 'admin');

    expect(plan).toEqual({ kind: 'question' });
  });
});
