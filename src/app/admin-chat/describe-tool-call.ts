import type { ToolCall } from '../../services/chat/chat-service.ts';

export const NOT_RUN = 'not_run';

export function describeToolCall(call: ToolCall): { tool: string; arguments: string } {
  return { tool: call.name, arguments: '' };
}

export function describeToolOutput(output: string): string {
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const list = Object.values(parsed).find(Array.isArray);
  return String(list?.length);
}
