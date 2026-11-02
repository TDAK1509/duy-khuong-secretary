export type IntakeOutcome =
  | { kind: 'stored'; messageId: string; replyText: string }
  | { kind: 'refused'; replyText: string }
  | { kind: 'already_replied' };
