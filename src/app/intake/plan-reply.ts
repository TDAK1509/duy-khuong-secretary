import type { ReadingDecision } from '../reading/decide-reading.ts';
import { saveAgreedReading } from '../reading/save-agreed-reading.ts';
import { formatSavedReply } from '../records/format-saved-reply.ts';
import { buildNewRecords, type NewRecord } from '../records/new-record.ts';
import { MAINTENANCE_WITHOUT_PLATE_TEXT, UNRESOLVED_TEXT, UPLOAD_ONLY_TEXT } from './intake-texts.ts';

type ReadBy = 'cheap_pair' | 'expensive_pair';

export type SavedRecords = { readBy: ReadBy; records: NewRecord[] };

export type ReplyPlan = {
  replyText: string;
  replyKind: 'saved' | 'answer';
  status: 'accepted' | 'unresolved';
  saved: SavedRecords | null;
};

export function planReply(decision: ReadingDecision): ReplyPlan {
  if (decision.agreed === null || decision.outcome === 'unresolved') return planUnresolvedReply();
  const reading = saveAgreedReading(...decision.agreed);
  if (!reading.has_work_data || reading.items.length === 0) return planUploadOnlyReply();
  return planRecordsReply(buildNewRecords(reading.items), decision.outcome);
}

function planRecordsReply(records: NewRecord[], readBy: ReadBy): ReplyPlan {
  if (records.some(isMaintenanceWithoutName)) return planUnresolvedReply();
  if (records.some(isMaintenanceWithoutPlate)) return planMaintenanceWithoutPlateReply();
  return { replyText: formatSavedReply(records), replyKind: 'saved', status: 'accepted', saved: { readBy, records } };
}

function isMaintenanceWithoutName(record: NewRecord): boolean {
  return record.category === 'maintenance' && record.maintenanceItem === null;
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
