import { describe, expect, it } from 'vitest';
import {
  ASK_AGAIN_TEXT,
  ASK_EXPLANATION_TEXT,
  PHOTO_BLURRY_TEXT,
  PHOTO_CUT_OFF_TEXT,
  PHOTO_NOT_WORK_TEXT,
  PHOTO_NOTHING_TO_SAVE_TEXT,
  READ_FAILED_PHOTO_TEXT,
  TEXT_NOTHING_TO_SAVE_TEXT,
} from '../../../src/app/intake/intake-texts.ts';
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

    expect(plan).toMatchObject({ saved: null, status: 'accepted', replyText: TEXT_NOTHING_TO_SAVE_TEXT });
  });
});

describe('planReply unclear readings', () => {
  it('is not unclear when the reader did not answer', () => {
    const plan = planReply({ ok: false, reason: 'timeout' }, false);

    expect(plan.isUnclear).toBe(false);
  });
});

describe('planReply text that needs an explanation', () => {
  it('is unclear and keeps the nothing-to-save reply when the reader says it needs an explanation', () => {
    const reading = makeReading([], { has_work_data: false, needs_explanation: true });

    const plan = planReply(succeed(reading), false);

    expect(plan).toMatchObject({ isUnclear: true, replyText: TEXT_NOTHING_TO_SAVE_TEXT });
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

describe('planReply a message without work data', () => {
  it('tells the sender a blurry photo could not be read', () => {
    const reading = makeReading([], { has_work_data: false, photo_problem: 'blurry' });

    const plan = planReply(succeed(reading), true);

    expect(plan).toMatchObject({ replyText: PHOTO_BLURRY_TEXT, status: 'accepted', situation: 'no_work_data' });
  });

  it('tells the sender a cut-off photo is missing part of the paper', () => {
    const reading = makeReading([], { has_work_data: false, photo_problem: 'cut_off' });

    const plan = planReply(succeed(reading), true);

    expect(plan.replyText).toBe(PHOTO_CUT_OFF_TEXT);
  });

  it('tells the sender a clear photo of something else is not a work paper', () => {
    const reading = makeReading([], { has_work_data: false, photo_problem: 'not_work' });

    const plan = planReply(succeed(reading), true);

    expect(plan.replyText).toBe(PHOTO_NOT_WORK_TEXT);
  });

  it('tells the sender a photo with no work data and no known problem has nothing to save', () => {
    const reading = makeReading([], { has_work_data: false, photo_problem: null });

    const plan = planReply(succeed(reading), true);

    expect(plan.replyText).toBe(PHOTO_NOTHING_TO_SAVE_TEXT);
  });

  it('tells the sender a text without work data has nothing to save', () => {
    const reading = makeReading([], { has_work_data: false });

    const plan = planReply(succeed(reading), false);

    expect(plan.replyText).toBe(TEXT_NOTHING_TO_SAVE_TEXT);
  });
});

describe('planReply a failed read', () => {
  it('tells the sender the photo could not be read because of an error, and leaves it unresolved', () => {
    const plan = planReply({ ok: false, reason: 'timeout' }, true);

    expect(plan).toMatchObject({ replyText: READ_FAILED_PHOTO_TEXT, status: 'unresolved' });
  });
});

describe('planAnswer', () => {
  const asked: AskedPhoto = { id: 'photo-1', imageKey: 'w/photo-1.jpg', status: 'needs_explanation' };
  const question = makeReading([], { has_work_data: false, has_question: true });
  const tireAndQuestion = makeReading([makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45' })], {
    has_question: true,
  });

  it('plans a question for an admin answer that asks and has no items', () => {
    const plan = planAnswer(succeed(question), asked, 'admin');

    expect(plan).toEqual({ kind: 'question' });
  });

  it('plans a save for an admin answer that has items and asks', () => {
    const plan = planAnswer(succeed(tireAndQuestion), asked, 'admin');

    expect(plan).toMatchObject({ kind: 'reply', photoAfter: 'same_as_reply', reply: { situation: 'saved', asksQuestion: true } });
  });

  it('plans to ask again for a member answer that asks and has no items', () => {
    const plan = planAnswer(succeed(question), asked, 'member');

    expect(plan).toMatchObject({ kind: 'reply', photoAfter: 'asked_again', reply: { replyText: ASK_AGAIN_TEXT } });
  });
});
