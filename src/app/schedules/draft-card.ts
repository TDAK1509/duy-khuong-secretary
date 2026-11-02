import type { Transaction } from '../db/transaction.ts';
import { formatVietnamDateTime } from '../workspaces/format-expiry.ts';
import type { PendingChoice } from '../identities/pending-choice.ts';
import { computeNextRun } from './compute-next-run.ts';
import { formatSchedule } from './format-schedule.ts';
import { readSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from './read-schedule.ts';

export type DraftCard = { text: string; choice: PendingChoice };

export type DraftOwner = { userId: string; workspaceId: string };

type DraftRow = ScheduleRow & { title: string; instruction: string };

export async function loadDraftCard(
  transaction: Transaction,
  taskId: string,
  owner: DraftOwner,
  now: Date,
): Promise<DraftCard | null> {
  const [draft] = await transaction.query<DraftRow>(
    `SELECT title, instruction, ${SCHEDULE_COLUMNS} FROM scheduled_tasks
     WHERE id = $1 AND created_by = $2 AND workspace_id = $3 AND status = 'draft'`,
    [taskId, owner.userId, owner.workspaceId],
  );
  if (!draft) return null;
  const choice: PendingChoice = { kind: 'draft_confirm', taskId, workspaceId: owner.workspaceId };
  return { text: formatDraftCard(draft, now), choice };
}

function formatDraftCard(draft: DraftRow, now: Date): string {
  const schedule = readSchedule(draft);
  return [
    `Lịch mới: ${draft.title}`,
    `Chạy: ${formatSchedule(schedule)}`,
    `Lần chạy đầu: ${formatVietnamDateTime(computeNextRun(schedule, now))}`,
    'Việc cần làm:',
    draft.instruction,
    'Lịch này chưa được lưu.',
    `Trả lời 1 để Lưu lịch "${draft.title}", 2 để Hủy.`,
  ].join('\n');
}
