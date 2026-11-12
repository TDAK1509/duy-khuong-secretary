import { describe, expect, it } from 'vitest';
import { ASK_EXPLANATION_TEXT, UPLOAD_ONLY_TEXT } from '../../../src/app/intake/intake-texts.ts';
import { planAnswer, planReply } from '../../../src/app/intake/plan-reply.ts';
import type { AskedPhoto } from '../../../src/app/intake/waiting-photos.ts';
import { makeItem, makeReading, succeed } from '../reading/make-reading.ts';

describe('planReply', () => {
  const unclear = makeReading([], { has_work_data: false, needs_explanation: true });

  it('saves nothing when the reader says the photo needs an explanation', () => {
    const plan = planReply(succeed(unclear), true);

    expect(plan).toMatchObject({ saved: null, status: 'needs_explanation', replyText: ASK_EXPLANATION_TEXT });
  });

  it('does not ask for an explanation of a message that has no photo', () => {
    const plan = planReply(succeed(unclear), false);

    expect(plan).toMatchObject({ saved: null, status: 'accepted', replyText: UPLOAD_ONLY_TEXT });
  });
});

describe('planReply unclear readings', () => {
  it('is not unclear when the reader did not answer', () => {
    const plan = planReply({ ok: false, reason: 'timeout' }, false);

    expect(plan.isUnclear).toBe(false);
  });
});

describe('planReply text that needs an explanation', () => {
  it('is unclear and keeps the upload-only reply when the reader says it needs an explanation', () => {
    const reading = makeReading([], { has_work_data: false, needs_explanation: true });

    const plan = planReply(succeed(reading), false);

    expect(plan).toMatchObject({ isUnclear: true, replyText: UPLOAD_ONLY_TEXT });
  });
});

describe('planReply maintenance without a plate', () => {
  it('is unclear', () => {
    const reading = makeReading([makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: null })]);

    const plan = planReply(succeed(reading), false);

    expect(plan.isUnclear).toBe(true);
  });
});

describe('planReply photo that needs an explanation', () => {
  it('is unclear when the reader says the photo needs an explanation', () => {
    const reading = makeReading([], { has_work_data: false, needs_explanation: true });

    const plan = planReply(succeed(reading), true);

    expect(plan.isUnclear).toBe(true);
  });
});

describe('planReply no work data', () => {
  it('is not unclear when the reader finds no work data', () => {
    const reading = makeReading([], { has_work_data: false, needs_explanation: false });

    const plan = planReply(succeed(reading), false);

    expect(plan.isUnclear).toBe(false);
  });
});

describe('planAnswer', () => {
  const asked: AskedPhoto = { id: 'photo-1', imageKey: 'w/photo-1.jpg', status: 'needs_explanation' };
  const question = makeReading([], { has_work_data: false, has_question: true });
  const tireAndQuestion = makeReading([makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45' })], {
    has_question: true,
  });

  it('plans a question for an answer that asks and has no items', () => {
    const plan = planAnswer(succeed(question), asked);

    expect(plan).toEqual({ kind: 'question' });
  });

  it('plans a save for an answer that has items and asks', () => {
    const plan = planAnswer(succeed(tireAndQuestion), asked);

    expect(plan).toMatchObject({ kind: 'reply', photoAfter: 'same_as_reply', reply: { situation: 'saved', asksQuestion: true } });
  });
});
