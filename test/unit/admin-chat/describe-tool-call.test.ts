import { describe, expect, it } from 'vitest';
import { describeToolCall } from '../../../src/app/admin-chat/describe-tool-call.ts';

function describeArguments(argumentsObject: unknown): string {
  return describeToolCall({ id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(argumentsObject) }).arguments;
}

describe('describing a tool call for the log', () => {
  it('shows the value of a real date argument', () => {
    expect(describeArguments({ added_from: '2026-11-05' })).toContain('added_from:2026-11-05');
  });

  it('shows only the name of an impossible date argument', () => {
    const described = describeArguments({ occurred_to: '2026-02-30' });

    expect(described).toContain('occurred_to');
    expect(described).not.toContain('2026-02-30');
  });

  it('shows only the name of a text argument', () => {
    const described = describeArguments({ text: 'cheng loong' });

    expect(described).toContain('text');
    expect(described).not.toContain('cheng');
  });

  it('leaves out null and empty-array arguments', () => {
    expect(describeArguments({ plate: null, ids: [], text: 'a' })).toBe('text');
  });

  it('keeps an array argument that has items', () => {
    expect(describeArguments({ ids: ['x'] })).toBe('ids');
  });
});
