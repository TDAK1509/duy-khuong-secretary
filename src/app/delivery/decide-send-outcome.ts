import type { SendResult } from '../../services/messaging/messaging-channel.ts';
import { describeNoConnection, describeOutboundMessageFailed, describeSendGotNoAnswer } from '../alerts/alert-texts.ts';
import { mayBeHeld, type ClaimedMessage } from './claimed-message.ts';

export type Rewrite = 'plain_text' | 'photo_with_text' | 'without_quote';

export type Settlement = {
  status: 'sent' | 'queued' | 'held' | 'failed' | 'unknown';
  availableAt?: Date;
  sentAt?: Date;
  lastError?: string;
  rewrite?: Rewrite;
  recheck?: { lastInboundAt: Date | null };
};

export type SendOutcome = { settlement: Settlement; alert?: string };

type FailedSend = Extract<SendResult, { ok: false }>;

const IMAGE_REJECTED = 'image_rejected';
const QUOTE_REJECTED = 'quote_rejected';
const RATE_LIMIT_WAIT_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const UNREACHABLE_FIRST_WAIT_MS = 30_000;
const UNREACHABLE_MAX_ATTEMPTS = 5;
const NO_CONNECTION_WAIT_MS = 60_000;
const NO_CONNECTION_MAX_ATTEMPTS = 5;

export function decideSendOutcome(message: ClaimedMessage, result: SendResult, now: Date): SendOutcome {
  if (result.ok) return { settlement: { status: 'sent', sentAt: now } };
  return decideFailureOutcome(message, result, now);
}

export function decideNoConnectionOutcome(message: ClaimedMessage, now: Date): SendOutcome {
  if (message.attempts >= NO_CONNECTION_MAX_ATTEMPTS) return decideGiveUp(message, 'no_connection');
  return {
    settlement: {
      status: 'queued',
      availableAt: new Date(now.getTime() + NO_CONNECTION_WAIT_MS),
      lastError: 'no_connection',
    },
    alert: describeNoConnection(message.to.accountId),
  };
}

function decideFailureOutcome(message: ClaimedMessage, result: FailedSend, now: Date): SendOutcome {
  switch (result.reason) {
    case 'rate_limited':
      return retryOrGiveUp(message, result, now, RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WAIT_MS);
    case 'unavailable':
      return retryOrGiveUp(
        message,
        result,
        now,
        UNREACHABLE_MAX_ATTEMPTS,
        UNREACHABLE_FIRST_WAIT_MS * 2 ** (message.attempts - 1),
      );
    case 'no_answer':
      return { settlement: { status: 'unknown', lastError: result.reason }, alert: describeSendGotNoAnswer(message.id) };
    case 'window_closed':
      return mayBeHeld(message) ? { settlement: { status: 'held', lastError: result.reason } } : failSend(result);
    case 'rejected':
      return decideRejection(message, result);
  }
}

function decideRejection(message: ClaimedMessage, result: FailedSend): SendOutcome {
  const { content } = message;
  if (content.kind === 'image' && content.text !== undefined) return requeueRewritten('plain_text', IMAGE_REJECTED);
  if (content.kind === 'text' && content.quote) {
    return requeueRewritten(content.quote.fallbackPhotoKey ? 'photo_with_text' : 'without_quote', QUOTE_REJECTED);
  }
  return failSend(result);
}

function requeueRewritten(rewrite: Rewrite, lastError: string): SendOutcome {
  return { settlement: { status: 'queued', lastError, rewrite } };
}

function failSend(result: FailedSend): SendOutcome {
  return { settlement: { status: 'failed', lastError: result.reason } };
}

function retryOrGiveUp(
  message: ClaimedMessage,
  result: FailedSend,
  now: Date,
  maxAttempts: number,
  waitMs: number,
): SendOutcome {
  if (message.attempts >= maxAttempts) return decideGiveUp(message, result.reason);
  return { settlement: { status: 'queued', availableAt: new Date(now.getTime() + waitMs), lastError: result.reason } };
}

function decideGiveUp(message: ClaimedMessage, reason: string): SendOutcome {
  return {
    settlement: { status: 'failed', lastError: reason },
    alert: describeOutboundMessageFailed(message.id, message.attempts),
  };
}
