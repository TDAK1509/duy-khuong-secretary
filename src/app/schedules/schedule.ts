export type RepeatingSchedule =
  | { repeat: 'daily'; timeOfDay: string }
  | { repeat: 'weekly'; timeOfDay: string; weekday: number }
  | { repeat: 'monthly'; timeOfDay: string; dayOfMonth: number };

export type Schedule = { repeat: 'once'; runOnceAt: Date } | RepeatingSchedule;

export type MaintenanceRule = { maintenanceItem: string; ageDays: number };

export type NewDraft = {
  workspaceId: string;
  createdBy: string;
  title: string;
  instruction: string;
  schedule: Schedule;
  maintenanceRules: MaintenanceRule[];
};
