import type { ReadingDecision } from '../reading/decide-reading.ts';
import { saveAgreedReading } from '../reading/save-agreed-reading.ts';
import { formatSavedReply } from '../records/format-saved-reply.ts';
import { buildNewRecords, type NewRecord } from '../records/new-record.ts';
import { UPLOAD_ONLY_TEXT } from './intake-texts.ts';

export type ReplyPlan = {
  replyText: string;
  replyKind: 'saved' | 'answer';
  status: 'accepted' | 'unresolved';
  readBy: 'cheap_pair' | 'expensive_pair';
  records: NewRecord[];
};

export function planReply(decision: ReadingDecision): ReplyPlan {
  if (decision.agreed === null || decision.outcome === 'unresolved') return planUploadOnlyReply();
  const saved = saveAgreedReading(...decision.agreed);
  if (!saved.has_work_data || saved.items.length === 0) return planUploadOnlyReply();
  const records = buildNewRecords(saved.items);
  return { replyText: formatSavedReply(records), replyKind: 'saved', status: 'accepted', readBy: decision.outcome, records };
}

function planUploadOnlyReply(): ReplyPlan {
  return { replyText: UPLOAD_ONLY_TEXT, replyKind: 'answer', status: 'accepted', readBy: 'cheap_pair', records: [] };
}
