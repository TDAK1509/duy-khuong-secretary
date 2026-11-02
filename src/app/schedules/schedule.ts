export type Schedule =
  | { repeat: 'daily'; timeOfDay: string }
  | { repeat: 'weekly'; timeOfDay: string; weekday: number }
  | { repeat: 'monthly'; timeOfDay: string; dayOfMonth: number };

export type NewDraft = { workspaceId: string; createdBy: string; title: string; instruction: string; schedule: Schedule };
