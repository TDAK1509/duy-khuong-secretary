export type Schedule =
  | { repeat: 'daily'; timeOfDay: string }
  | { repeat: 'weekly'; timeOfDay: string; weekday: number };
