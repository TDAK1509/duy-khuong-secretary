import type { StoredCall } from './stored-call.ts';

export type WaitingChange = { call: StoredCall; question: string };

export class WaitingChanges {
  private readonly changes: WaitingChange[] = [];

  add(change: WaitingChange): void {
    const key = describeCall(change.call);
    if (!this.changes.some(({ call }) => describeCall(call) === key)) this.changes.push(change);
  }

  list(): WaitingChange[] {
    return [...this.changes];
  }
}

export function buildConfirmationQuestion(changes: WaitingChange[]): string {
  const lines = changes.map(({ question }) => `- ${question}`);
  return ['Cần bạn xác nhận trước khi làm:', ...lines, 'Trả lời Có để làm, Không để bỏ.'].join('\n');
}

function describeCall({ name, arguments: callArguments }: StoredCall): string {
  return `${name} ${JSON.stringify(callArguments)}`;
}
