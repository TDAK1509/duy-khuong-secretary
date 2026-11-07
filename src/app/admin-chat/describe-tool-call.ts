import type { ToolCall } from '../../services/chat/chat-service.ts';

export const NOT_RUN = 'not_run';

const DATE_ARGUMENTS = ['added_from', 'added_to', 'occurred_from', 'occurred_to'];

export function describeToolCall(call: ToolCall): { tool: string; arguments: string } {
  return { tool: call.name, arguments: describeArguments(call.argumentsJson) };
}

function describeArguments(argumentsJson: string): string {
  const parsed = JSON.parse(argumentsJson) as Record<string, unknown>;
  const described = Object.entries(parsed).map(([name, value]) => (DATE_ARGUMENTS.includes(name) ? `${name}:${String(value)}` : name));
  return described.join(';');
}

export function describeToolOutput(output: string): string {
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const list = Object.values(parsed).find(Array.isArray);
  return String(list?.length);
}
