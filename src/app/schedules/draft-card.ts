import type { Transaction } from '../db/transaction.ts';
import { formatVietnamDateTime } from '../workspaces/format-expiry.ts';
import type { PendingChoice } from '../identities/pending-choice.ts';
import { computeNextRun } from './compute-next-run.ts';
import { formatSchedule } from './format-schedule.ts';
import { formatRules, readStoredRules } from './maintenance-rules.ts';
import { readSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from './schedule-columns.ts';

export type DraftCard = { text: string; choice: PendingChoice };

export type DraftOwner = { userId: string; workspaceId: string };

type DraftRow = ScheduleRow & {
  title: string;
  instruction: string;
  maintenance_rules: { maintenance_item: string; age_days: number }[];
};

export async function loadDraftCard(
  transaction: Transaction,
  proposal: { taskId: string; replacedTitle: string | null },
  owner: DraftOwner,
  now: Date,
): Promise<DraftCard | null> {
  const [draft] = await transaction.query<DraftRow>(
    `SELECT title, instruction, maintenance_rules, ${SCHEDULE_COLUMNS} FROM scheduled_tasks
     WHERE id = $1 AND created_by = $2 AND workspace_id = $3 AND status = 'draft'`,
    [proposal.taskId, owner.userId, owner.workspaceId],
  );
  const firstRun = draft ? computeNextRun(readSchedule(draft), now) : null;
  if (!draft || firstRun === null) return null;
  const choice: PendingChoice = { kind: 'draft_confirm', taskId: proposal.taskId, workspaceId: owner.workspaceId };
  return { text: formatDraftCard(draft, proposal.replacedTitle, firstRun), choice };
}

function formatDraftCard(draft: DraftRow, replacedTitle: string | null, firstRun: Date): string {
  return [
    ...(replacedTitle === null ? [] : [`Lịch nháp trước "${replacedTitle}" đã được thay bằng lịch này.`]),
    `Lịch mới: ${draft.title}`,
    `Chạy: ${formatSchedule(readSchedule(draft))}`,
    `Lần chạy đầu: ${formatVietnamDateTime(firstRun)}`,
    'Việc cần làm:',
    draft.instruction,
    ...formatRulesLine(draft),
    'Lịch này chưa được lưu.',
    `Trả lời 1 để Lưu lịch "${draft.title}", 2 để Hủy.`,
  ].join('\n');
}

function formatRulesLine(draft: DraftRow): string[] {
  const rules = readStoredRules(draft.maintenance_rules);
  return rules.length === 0 ? [] : [`Nhắc bảo dưỡng: ${formatRules(rules)}`];
}
