export type ConfirmAction = 'save';

export function readConfirmReply(text: string): ConfirmAction | null {
  return text.trim() === '1' ? 'save' : null;
}
