import type { SendResult } from '../../services/messaging/messaging-channel.ts';
import { describeNoConnection, describeOutboundMessageFailed, describeSendGotNoAnswer } from '../alerts/alert-texts.ts';
import type { ClaimedMessage } from './claimed-message.ts';

export type Settlement = {
  status: 'sent' | 'queued' | 'failed' | 'unknown';
  availableAt?: Date;
  sentAt?: Date;
  lastError?: string;
};

export type SendOutcome = { settlement: Settlement; alert?: string };

type FailedSend = Extract<SendResult, { ok: false }>;

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
    case 'rejected':
    case 'window_closed':
      return { settlement: { status: 'failed', lastError: result.reason } };
  }
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
