import { formatVietnamDateTime } from '../workspaces/format-expiry.ts';
import { formatSchedule } from './format-schedule.ts';
import { formatRules } from './maintenance-rules.ts';
import type { MaintenanceRule, Schedule } from './schedule.ts';

const MAX_INSTRUCTION_CHARACTERS = 200;

export type TaskSummary = {
  title: string;
  schedule: Schedule;
  firstRun: Date;
  instruction: string;
  maintenanceRules: MaintenanceRule[];
};

export function formatTaskSummary(task: TaskSummary): string {
  return [
    `Đã đặt lịch "${task.title}".`,
    `Chạy: ${formatSchedule(task.schedule)}`,
    `Lần chạy đầu: ${formatVietnamDateTime(task.firstRun)}`,
    `Việc cần làm: ${cutInstruction(task.instruction)}`,
    ...formatRulesLine(task.maintenanceRules),
    `Muốn hủy lịch này, nhắn: Hủy lịch "${task.title}"`,
  ].join('\n');
}

function cutInstruction(instruction: string): string {
  const characters = Array.from(instruction);
  if (characters.length <= MAX_INSTRUCTION_CHARACTERS) return instruction;
  return `${characters.slice(0, MAX_INSTRUCTION_CHARACTERS).join('')}…`;
}

function formatRulesLine(rules: MaintenanceRule[]): string[] {
  return rules.length === 0 ? [] : [`Nhắc bảo dưỡng: ${formatRules(rules)}`];
}
