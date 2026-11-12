import type { ReadAttempt, Reading, ReadingItem } from '../reading/reading.ts';
import { formatSavedReply } from '../records/format-saved-reply.ts';
import { buildNewRecords, type NewRecord } from '../records/new-record.ts';
import {
  ASK_AGAIN_TEXT,
  ASK_EXPLANATION_TEXT,
  DUPLICATE_TEXT,
  MAINTENANCE_WITHOUT_PLATE_TEXT,
  PHOTO_BLURRY_TEXT,
  PHOTO_CUT_OFF_TEXT,
  PHOTO_NOT_WORK_TEXT,
  PHOTO_NOTHING_TO_SAVE_TEXT,
  READ_FAILED_PHOTO_TEXT,
  READ_FAILED_TEXT,
  STILL_UNCLEAR_TEXT,
  TEXT_NOTHING_TO_SAVE_TEXT,
} from './intake-texts.ts';
import type { SubmissionStatus } from './store-user-message.ts';
import type { AskedPhoto } from './waiting-photos.ts';

export type ReplyPlan = {
  replyText: string;
  replyKind: 'saved' | 'answer';
  status: SubmissionStatus;
  saved: NewRecord[] | null;
  readItems: ReadingItem[];
  situation: 'saved' | 'no_work_data' | 'needs_explanation' | 'refused';
  asksQuestion: boolean;
  isUnclear: boolean;
};

export type ReplyAnswer = {
  kind: 'reply';
  reply: ReplyPlan;
  photoAfter: 'same_as_reply' | 'asked_again' | 'unresolved' | 'unchanged';
};

export type AnswerPlan = { kind: 'question' } | ReplyAnswer;

export function planAnswer(attempt: ReadAttempt, asked: AskedPhoto): AnswerPlan {
  if (!attempt.ok) return planUnreadAnswer();
  const reply = planReply(attempt, true);
  if (reply.situation === 'saved') return { kind: 'reply', reply, photoAfter: 'same_as_reply' };
  if (attempt.reading.has_question) return { kind: 'question' };
  if (asked.status === 'asked_again') return { kind: 'reply', reply: planRefusal(STILL_UNCLEAR_TEXT), photoAfter: 'unresolved' };
  return { kind: 'reply', reply: planRefusal(ASK_AGAIN_TEXT), photoAfter: 'asked_again' };
}

export function asksOnlyAQuestion(attempt: ReadAttempt): boolean {
  return attempt.ok && attempt.reading.has_question && attempt.reading.items.length === 0;
}

export function planReply(attempt: ReadAttempt, hasPhoto: boolean): ReplyPlan {
  return attempt.ok ? planReadingReply(attempt.reading, hasPhoto) : planReadFailedReply(hasPhoto);
}

function planReadingReply(reading: Reading, hasPhoto: boolean): ReplyPlan {
  if (reading.needs_explanation && hasPhoto) return planExplanationRequest();
  if (!reading.has_work_data || reading.items.length === 0) return planNoWorkDataReply(reading, hasPhoto);
  return planRecordsReply(reading.items, reading.has_question);
}

export function planUnreadAnswer(): AnswerPlan {
  return { kind: 'reply', reply: planReadFailedReply(true), photoAfter: 'unchanged' };
}

function planRecordsReply(readItems: ReadingItem[], asksQuestion: boolean): ReplyPlan {
  const records = buildNewRecords(readItems);
  if (records.some(isMaintenanceWithoutPlate)) return planMaintenanceWithoutPlateReply();
  return {
    replyText: formatSavedReply(records),
    replyKind: 'saved',
    status: 'accepted',
    saved: records,
    readItems,
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
  return { ...planRefusal(MAINTENANCE_WITHOUT_PLATE_TEXT), isUnclear: true };
}

function planReadFailedReply(hasPhoto: boolean): ReplyPlan {
  return planRefusal(hasPhoto ? READ_FAILED_PHOTO_TEXT : READ_FAILED_TEXT);
}

function planRefusal(replyText: string, status: ReplyPlan['status'] = 'unresolved'): ReplyPlan {
  return {
    replyText,
    replyKind: 'answer',
    status,
    saved: null,
    readItems: [],
    situation: 'refused',
    asksQuestion: false,
    isUnclear: false,
  };
}

function planExplanationRequest(): ReplyPlan {
  return {
    replyText: ASK_EXPLANATION_TEXT,
    replyKind: 'answer',
    status: 'needs_explanation',
    saved: null,
    readItems: [],
    situation: 'needs_explanation',
    asksQuestion: false,
    isUnclear: true,
  };
}

function planNoWorkDataReply(reading: Reading, hasPhoto: boolean): ReplyPlan {
  return {
    replyText: pickNoWorkDataText(reading.photo_problem, hasPhoto),
    replyKind: 'answer',
    status: 'accepted',
    saved: null,
    readItems: [],
    situation: 'no_work_data',
    asksQuestion: false,
    isUnclear: reading.needs_explanation,
  };
}

function pickNoWorkDataText(photoProblem: Reading['photo_problem'], hasPhoto: boolean): string {
  if (!hasPhoto) return TEXT_NOTHING_TO_SAVE_TEXT;
  return photoProblem === null ? PHOTO_NOTHING_TO_SAVE_TEXT : PHOTO_PROBLEM_TEXTS[photoProblem];
}

const PHOTO_PROBLEM_TEXTS = {
  blurry: PHOTO_BLURRY_TEXT,
  cut_off: PHOTO_CUT_OFF_TEXT,
  not_work: PHOTO_NOT_WORK_TEXT,
};
