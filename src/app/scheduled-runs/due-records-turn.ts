import type { DueRecord } from './find-due-records.ts';

export function buildDueRecordsTurn(instruction: string, dueRecords: DueRecord[]): string {
  return `${instruction}\n\nHồ sơ bảo dưỡng đến hạn:\n${JSON.stringify(dueRecords.map(toDueListItem))}`;
}

function toDueListItem(record: DueRecord): object {
  return {
    plate: record.plate,
    maintenance_item: record.maintenance_item,
    sent_by: record.sent_by,
    sent_on: record.sent_on,
    occurred_on: record.occurred_on,
    days_since_sent: record.days_since_sent,
  };
}
