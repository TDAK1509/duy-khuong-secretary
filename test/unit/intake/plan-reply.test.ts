import { describe, expect, it } from 'vitest';
import { ASK_EXPLANATION_TEXT } from '../../../src/app/intake/intake-texts.ts';
import { planReply } from '../../../src/app/intake/plan-reply.ts';
import type { ReadingDecision } from '../../../src/app/reading/decide-reading.ts';
import { makeReading, succeed } from '../reading/make-reading.ts';

describe('planReply', () => {
  it('saves nothing when both readers say the photo needs an explanation', () => {
    const unclear = makeReading([], { has_work_data: false, needs_explanation: true });
    const decision: ReadingDecision = {
      outcome: 'cheap_pair',
      cheap: [succeed(unclear), succeed(unclear)],
      strong: null,
      agreed: [unclear, unclear],
    };

    const plan = planReply(decision);

    expect(plan).toMatchObject({ saved: null, status: 'needs_explanation', replyText: ASK_EXPLANATION_TEXT });
  });
});
