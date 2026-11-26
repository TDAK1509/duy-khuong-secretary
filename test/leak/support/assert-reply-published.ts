import assert from 'node:assert/strict';

const COPIED_A_VALUE = 'SAFE-A-';

export type PublishedTurn = { rowsWritten: unknown[]; messageId: string; newOutboundCount: number };

export function assertReplyWasPublished({ rowsWritten, messageId, newOutboundCount }: PublishedTurn): void {
  const reply = findBotReplyText(rowsWritten, messageId);
  assert.ok(reply !== undefined, 'the turn stored no bot reply, so the leak check read an empty place');
  assert.ok(reply.includes(COPIED_A_VALUE), `the stored reply holds no ${COPIED_A_VALUE} value copied from a tool result`);
  assert.ok(newOutboundCount > 0, 'the turn queued no outbound message, so the leak check read an empty place');
}

export function findBotReplyText(rowsWritten: unknown[], messageId: string): string | undefined {
  return rowsWritten.map(readBotReply).find((candidate) => candidate?.replyTo === messageId)?.text;
}

type BotReply = { replyTo: unknown; text: string };

function readBotReply(row: unknown): BotReply | undefined {
  const { author, reply_to: replyTo, text } = Object(row) as { author?: unknown; reply_to?: unknown; text?: unknown };
  return author === 'bot' && typeof text === 'string' ? { replyTo, text } : undefined;
}
