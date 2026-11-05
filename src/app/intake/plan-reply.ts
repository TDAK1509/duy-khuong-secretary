import type { CodeChoice } from '../reading/code-choice.ts';
import { isReaderOutage, type ReadingDecision } from '../reading/decide-reading.ts';
import { findCodeSplit, type CodeSplit } from '../reading/find-code-split.ts';
import { saveAgreedReading, type SavedReading } from '../reading/save-agreed-reading.ts';
import { formatSavedReply } from '../records/format-saved-reply.ts';
import { buildNewRecords, type NewRecord } from '../records/new-record.ts';
import {
  ASK_AGAIN_TEXT,
  ASK_EXPLANATION_TEXT,
  CODE_CHOICE_TEXT,
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
  situation: 'saved' | 'no_work_data' | 'needs_explanation' | 'code_choice' | 'refused';
  asksQuestion: boolean;
  isUnclear: boolean;
  codeChoice: CodeChoice | null;
};

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
  if (reply.situation === 'code_choice') return planCodeQuestionAnswer(reply);
  if (role === 'admin' && hasAgreedQuestion(decision)) return { kind: 'question' };
  if (asked.status === 'asked_again') return { kind: 'reply', reply: planRefusal(STILL_UNCLEAR_TEXT), photoAfter: 'unresolved' };
  return { kind: 'reply', reply: planRefusal(ASK_AGAIN_TEXT), photoAfter: 'asked_again' };
}

function planCodeQuestionAnswer(reply: ReplyPlan): ReplyAnswer {
  return { kind: 'reply', reply: { ...reply, status: 'accepted' }, photoAfter: 'unchanged' };
}

export function planCodeAnswer({ item }: CodeChoice, code: string): ReplyAnswer {
  const records = buildNewRecords([{ ...item, identifiers: [...item.identifiers, code] }]);
  return { kind: 'reply', reply: planRecordsReply(records, 'expensive_pair', false), photoAfter: 'same_as_reply' };
}

function hasAgreedQuestion({ agreed, outcome }: ReadingDecision): boolean {
  return agreed !== null && outcome !== 'unresolved' && saveAgreedReading(...agreed).has_question;
}

export function asksOnlyAQuestion({ agreed, outcome }: ReadingDecision): boolean {
  if (agreed === null || outcome === 'unresolved') return false;
  const reading = saveAgreedReading(...agreed);
  return reading.has_question && reading.items.length === 0;
}

export function planReply(decision: ReadingDecision, hasPhoto: boolean): ReplyPlan {
  if (decision.agreed === null || decision.outcome === 'unresolved') return planUnagreedReply(decision, hasPhoto);
  return planAgreedReply(saveAgreedReading(...decision.agreed), decision.outcome, hasPhoto);
}

function planUnagreedReply(decision: ReadingDecision, hasPhoto: boolean): ReplyPlan {
  const split = hasPhoto ? findCodeSplit(decision) : null;
  return split === null ? planUnresolvedReply(!isReaderOutage(decision)) : planCodeSplitReply(split);
}

function planCodeSplitReply({ reading, codes }: CodeSplit): ReplyPlan {
  const plan = planAgreedReply(reading, 'expensive_pair', true);
  const [item] = reading.items;
  return plan.situation === 'saved' && item !== undefined ? planCodeQuestion({ item, codes }) : plan;
}

function planCodeQuestion(codeChoice: CodeChoice): ReplyPlan {
  return {
    replyText: CODE_CHOICE_TEXT,
    replyKind: 'answer',
    status: 'needs_explanation',
    saved: null,
    situation: 'code_choice',
    asksQuestion: false,
    isUnclear: false,
    codeChoice,
  };
}

function planAgreedReply(reading: SavedReading, readBy: ReadBy, hasPhoto: boolean): ReplyPlan {
  if (reading.needs_explanation && hasPhoto) return planExplanationRequest();
  if (!reading.has_work_data || reading.items.length === 0) return planUploadOnlyReply(reading.needs_explanation);
  return planRecordsReply(buildNewRecords(reading.items), readBy, reading.has_question);
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
    codeChoice: null,
  };
}

function isMaintenanceWithoutPlate(record: NewRecord): boolean {
  return record.maintenanceItem !== null && record.vehiclePlate === null;
}

export function planDuplicateReply(): ReplyPlan {
  return planRefusal(DUPLICATE_TEXT, 'duplicate');
}

function planMaintenanceWithoutPlateReply(): ReplyPlan {
  return { ...planRefusal(MAINTENANCE_WITHOUT_PLATE_TEXT), isUnclear: true };
}

function planUnresolvedReply(isUnclear = false): ReplyPlan {
  return { ...planRefusal(UNRESOLVED_TEXT), isUnclear };
}

function planRefusal(replyText: string, status: ReplyPlan['status'] = 'unresolved'): ReplyPlan {
  return {
    replyText,
    replyKind: 'answer',
    status,
    saved: null,
    situation: 'refused',
    asksQuestion: false,
    isUnclear: false,
    codeChoice: null,
  };
}

function planExplanationRequest(): ReplyPlan {
  return {
    replyText: ASK_EXPLANATION_TEXT,
    replyKind: 'answer',
    status: 'needs_explanation',
    saved: null,
    situation: 'needs_explanation',
    asksQuestion: false,
    isUnclear: true,
    codeChoice: null,
  };
}

function planUploadOnlyReply(isUnclear: boolean): ReplyPlan {
  return {
    replyText: UPLOAD_ONLY_TEXT,
    replyKind: 'answer',
    status: 'accepted',
    saved: null,
    situation: 'no_work_data',
    asksQuestion: false,
    isUnclear,
    codeChoice: null,
  };
}
