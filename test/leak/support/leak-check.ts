import assert from 'node:assert/strict';

const SECRET_TEXT = /LEAK-B-[A-Za-z0-9-]*/g;
const WORKSPACE_B_ID = /bbbbbbbb-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

export type LeakCheckOptions = { passedIds?: string[]; label?: string };

export function assertNoLeak(values: unknown[], options: LeakCheckOptions = {}): void {
  const leaks = values.flatMap((value) => findLeaks(describeValue(value), options.passedIds ?? []));
  assert.deepEqual(leaks, [], `workspace B data reached workspace A${options.label === undefined ? '' : ` in ${options.label}`}`);
}

export function collectPassedIds(toolArguments: unknown): string[] {
  return describeValue(toolArguments).match(WORKSPACE_B_ID) ?? [];
}

function findLeaks(text: string, passedIds: string[]): string[] {
  const secrets = text.match(SECRET_TEXT) ?? [];
  const ids = (text.match(WORKSPACE_B_ID) ?? []).filter((id) => !passedIds.includes(id));
  return [...secrets, ...ids];
}

function describeValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
