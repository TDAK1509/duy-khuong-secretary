import type { ReadingDecision } from '../reading/decide-reading.ts';
import { saveAgreedReading } from '../reading/save-agreed-reading.ts';
import { formatSavedReply } from '../records/format-saved-reply.ts';
import { buildNewRecords, type NewRecord } from '../records/new-record.ts';
import { MAINTENANCE_WITHOUT_PLATE_TEXT, UNRESOLVED_TEXT, UPLOAD_ONLY_TEXT } from './intake-texts.ts';

export type SavedRecords = { readBy: 'cheap_pair' | 'expensive_pair'; records: NewRecord[] };

export type ReplyPlan = {
  replyText: string;
  replyKind: 'saved' | 'answer';
  status: 'accepted' | 'unresolved';
  saved: SavedRecords | null;
};

export function planReply(decision: ReadingDecision): ReplyPlan {
  if (decision.agreed === null || decision.outcome === 'unresolved') return planUnresolvedReply();
  const saved = saveAgreedReading(...decision.agreed);
  if (!saved.has_work_data || saved.items.length === 0) return planUploadOnlyReply();
  const records = buildNewRecords(saved.items);
  if (records.some(isMaintenanceWithoutPlate)) return planMaintenanceWithoutPlateReply();
  return {
    replyText: formatSavedReply(records),
    replyKind: 'saved',
    status: 'accepted',
    saved: { readBy: decision.outcome, records },
  };
}

function isMaintenanceWithoutPlate(record: NewRecord): boolean {
  return record.category === 'maintenance' && record.vehiclePlate === null;
}

function planMaintenanceWithoutPlateReply(): ReplyPlan {
  return { replyText: MAINTENANCE_WITHOUT_PLATE_TEXT, replyKind: 'answer', status: 'unresolved', saved: null };
}

function planUnresolvedReply(): ReplyPlan {
  return { replyText: UNRESOLVED_TEXT, replyKind: 'answer', status: 'unresolved', saved: null };
}

function planUploadOnlyReply(): ReplyPlan {
  return { replyText: UPLOAD_ONLY_TEXT, replyKind: 'answer', status: 'accepted', saved: null };
}
