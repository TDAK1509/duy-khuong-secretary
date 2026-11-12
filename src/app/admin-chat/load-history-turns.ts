import type { ChatTurn } from '../../services/chat/chat-service.ts';
import type { Database } from '../db/transaction.ts';
import type { IntakeSender } from '../intake/find-intake-sender.ts';

const HISTORY_LIMIT = 20;
const PHOTO_MARK = '[ảnh]';
const HIDDEN_ANSWER_TEXT = '(Câu trả lời cũ đã được ẩn.)';

export type History = { turns: ChatTurn[]; hasFlaggedAnswer: boolean };

type HistoryRow = { author: 'user' | 'bot'; text: string | null; image_key: string | null; holds_other_text: boolean };

export async function loadHistoryTurns(
  database: Database,
  sender: IntakeSender,
  joinedAt: Date,
  currentMessageId: string,
  hideFlaggedAnswers: boolean,
): Promise<History> {
  const { rows } = await database.query<HistoryRow>(
    `SELECT author, text, image_key, holds_other_text FROM messages
     WHERE workspace_id = $1 AND user_id = $2 AND created_at >= $3 AND source <> 'mcp'
       AND id <> $4 AND reply_to IS DISTINCT FROM $4
     ORDER BY created_at DESC, id DESC
     LIMIT $5`,
    [sender.workspaceId, sender.userId, joinedAt, currentMessageId, HISTORY_LIMIT],
  );
  return {
    turns: rows.reverse().map((row) => toTurn(row, hideFlaggedAnswers)),
    hasFlaggedAnswer: rows.some((row) => row.author === 'bot' && row.holds_other_text),
  };
}

function toTurn(row: HistoryRow, hideFlaggedAnswers: boolean): ChatTurn {
  if (row.author === 'bot') return { role: 'assistant', text: describeAnswer(row, hideFlaggedAnswers) };
  return { role: 'user', text: row.image_key === null ? row.text : describePhotoMessage(row.text) };
}

function describeAnswer({ text, holds_other_text: holdsOtherText }: HistoryRow, hideFlaggedAnswers: boolean): string {
  return text === null || (hideFlaggedAnswers && holdsOtherText) ? HIDDEN_ANSWER_TEXT : text;
}

function describePhotoMessage(text: string | null): string {
  return text === null ? PHOTO_MARK : `${PHOTO_MARK} ${text}`;
}
