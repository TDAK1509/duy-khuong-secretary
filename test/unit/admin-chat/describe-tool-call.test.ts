import { describe, expect, it } from 'vitest';
import { describeToolCall, describeToolOutput } from '../../../src/app/admin-chat/describe-tool-call.ts';

describe('describing a tool call for the log', () => {
  it('shows the value of a real date argument', () => {
    expect(describeArguments({ added_from: '2026-11-05' })).toContain('added_from:2026-11-05');
  });

  it('shows only the name of an impossible date argument', () => {
    const described = describeArguments({ added_to: '2026-02-30' });

    expect(described).toContain('added_to');
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
    expect(describeArguments({ text: ['x'] })).toBe('text');
  });

  it('sorts the argument names lexically', () => {
    expect(describeArguments({ text: 'a', added_to: '2026-11-06', category: 'b' })).toBe('added_to:2026-11-06;category;text');
  });

  it('shows invalid for arguments that cannot be parsed', () => {
    expect(describeArgumentsJson('{')).toBe('invalid');
  });

  it.each(['null', '[]', '"text"', '5'])('shows invalid for arguments that are not an object: %s', (argumentsJson) => {
    expect(describeArgumentsJson(argumentsJson)).toBe('invalid');
  });

  it('shows error for a tool output that says it failed', () => {
    expect(describeToolOutput('{"ok":false,"error":"Ngày không hợp lệ."}')).toBe('error');
  });

  it('shows a dash for a tool output without a top-level array', () => {
    expect(describeToolOutput('{"ok":true}')).toBe('-');
  });

  it.each(['not json', 'null', '[1,2]', '{"nested":{"items":[1]}}'])('shows a dash for an output that holds no top-level array: %s', (output) => {
    expect(describeToolOutput(output)).toBe('-');
  });

  it('counts the first top-level array of the output', () => {
    expect(describeToolOutput('{"ok":true,"labels":[1,2,3],"items":[1]}')).toBe('3');
  });

  it('names an unregistered tool unknown', () => {
    const described = describeToolCall({ id: 'call_1', name: 'find cheng loong', argumentsJson: '{}' });

    expect(described.tool).toBe('unknown');
  });

  it('names a registered admin tool by its name', () => {
    const described = describeToolCall({ id: 'call_1', name: 'count_records', argumentsJson: '{}' });

    expect(described.tool).toBe('count_records');
  });

  it('shows unknown for an argument the registered tool does not declare', () => {
    const described = describeArguments({ 'cheng loong\n[admin-chat] forged': true, text: 'a', zeta: 1 });

    expect(described).toBe('text;unknown;unknown');
  });

  it('shows unknown for every argument of an unregistered tool', () => {
    const described = describeToolCall({ id: 'call_1', name: 'find cheng loong', argumentsJson: '{"text":"a","added_from":"2026-11-05"}' });

    expect(described.arguments).toBe('unknown;unknown');
  });
});

function describeArguments(argumentsObject: unknown): string {
  return describeArgumentsJson(JSON.stringify(argumentsObject));
}

function describeArgumentsJson(argumentsJson: string): string {
  return describeToolCall({ id: 'call_1', name: 'search_records', argumentsJson }).arguments;
}
