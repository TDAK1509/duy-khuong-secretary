import { isReaderOutage, type ReadingDecision } from '../reading/decide-reading.ts';
import { saveAgreedReading } from '../reading/save-agreed-reading.ts';
import { formatSavedReply } from '../records/format-saved-reply.ts';
import { buildNewRecords, type NewRecord } from '../records/new-record.ts';
import {
  ASK_AGAIN_TEXT,
  ASK_EXPLANATION_TEXT,
  DUPLICATE_TEXT,
  MAINTENANCE_WITHOUT_PLATE_TEXT,
  STILL_UNCLEAR_TEXT,
  UNRESOLVED_TEXT,
  UPLOAD_ONLY_TEXT,
} from './intake-texts.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { SubmissionStatus } from './store-user-message.ts';
import type { AskedPhoto } from './waiting-photos.ts';

type ReadBy = 'cheap_pair' | 'expensive_pair';

export type SavedRecords = { readBy: ReadBy; records: NewRecord[] };

export type ReplyPlan = {
  replyText: string;
  replyKind: 'saved' | 'answer';
  status: SubmissionStatus;
  saved: SavedRecords | null;
  situation: 'saved' | 'no_work_data' | 'needs_explanation' | 'refused';
  asksQuestion: boolean;
  isUnclear: boolean;
};

export function planReply(decision: ReadingDecision, hasPhoto: boolean): ReplyPlan {
  if (decision.agreed === null || decision.outcome === 'unresolved') return { ...planUnresolvedReply(), isUnclear: true };
  const reading = saveAgreedReading(...decision.agreed);
  if (reading.needs_explanation && hasPhoto) return planExplanationRequest();
  if (!reading.has_work_data || reading.items.length === 0) return planUploadOnlyReply();
  return planRecordsReply(buildNewRecords(reading.items), decision.outcome, reading.has_question);
}

export type ReplyAnswer = {
  kind: 'reply';
  reply: ReplyPlan;
  photoAfter: 'same_as_reply' | 'asked_again' | 'unresolved' | 'unchanged';
};

export type AnswerPlan = { kind: 'question' } | ReplyAnswer;

export function planAnswer(decision: ReadingDecision, asked: AskedPhoto, role: IntakeSender['role']): AnswerPlan {
  if (isReaderOutage(decision)) return planUnreadAnswer();
  const reply = planReply(decision, true);
  if (reply.situation === 'saved') return { kind: 'reply', reply, photoAfter: 'same_as_reply' };
  if (role === 'admin' && hasAgreedQuestion(decision)) return { kind: 'question' };
  if (asked.status === 'asked_again') return { kind: 'reply', reply: planRefusal(STILL_UNCLEAR_TEXT), photoAfter: 'unresolved' };
  return { kind: 'reply', reply: planRefusal(ASK_AGAIN_TEXT), photoAfter: 'asked_again' };
}

function hasAgreedQuestion({ agreed, outcome }: ReadingDecision): boolean {
  return agreed !== null && outcome !== 'unresolved' && saveAgreedReading(...agreed).has_question;
}

export function planUnreadAnswer(): AnswerPlan {
  return { kind: 'reply', reply: planUnresolvedReply(), photoAfter: 'unchanged' };
}

function planRecordsReply(records: NewRecord[], readBy: ReadBy, asksQuestion: boolean): ReplyPlan {
  if (records.some(isMaintenanceWithoutPlate)) return planMaintenanceWithoutPlateReply();
  return {
    replyText: formatSavedReply(records),
    replyKind: 'saved',
    status: 'accepted',
    saved: { readBy, records },
    situation: 'saved',
    asksQuestion,
    isUnclear: false,
  };
}

function isMaintenanceWithoutPlate(record: NewRecord): boolean {
  return record.maintenanceItem !== null && record.vehiclePlate === null;
}

export function planDuplicateReply(): ReplyPlan {
  return planRefusal(DUPLICATE_TEXT, 'duplicate');
}

function planMaintenanceWithoutPlateReply(): ReplyPlan {
  return planRefusal(MAINTENANCE_WITHOUT_PLATE_TEXT);
}

function planUnresolvedReply(): ReplyPlan {
  return planRefusal(UNRESOLVED_TEXT);
}

function planRefusal(replyText: string, status: ReplyPlan['status'] = 'unresolved'): ReplyPlan {
  return { replyText, replyKind: 'answer', status, saved: null, situation: 'refused', asksQuestion: false, isUnclear: false };
}

function planExplanationRequest(): ReplyPlan {
  return {
    replyText: ASK_EXPLANATION_TEXT,
    replyKind: 'answer',
    status: 'needs_explanation',
    saved: null,
    situation: 'needs_explanation',
    asksQuestion: false,
    isUnclear: false,
  };
}

function planUploadOnlyReply(): ReplyPlan {
  return {
    replyText: UPLOAD_ONLY_TEXT,
    replyKind: 'answer',
    status: 'accepted',
    saved: null,
    situation: 'no_work_data',
    asksQuestion: false,
    isUnclear: false,
  };
}
