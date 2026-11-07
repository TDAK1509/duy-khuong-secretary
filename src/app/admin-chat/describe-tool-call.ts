import type { ToolCall } from '../../services/chat/chat-service.ts';
import { isRealIsoDate } from '../time/is-real-iso-date.ts';

export const NOT_RUN = 'not_run';

const DATE_ARGUMENTS = ['added_from', 'added_to', 'occurred_from', 'occurred_to'];

export function describeToolCall(call: ToolCall): { tool: string; arguments: string } {
  return { tool: call.name, arguments: describeArguments(call.argumentsJson) };
}

function describeArguments(argumentsJson: string): string {
  const parsed = JSON.parse(argumentsJson) as Record<string, unknown>;
  return Object.entries(parsed)
    .filter(([, value]) => !isEmptyArgument(value))
    .map(([name, value]) => describeArgument(name, value))
    .join(';');
}

function isEmptyArgument(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function describeArgument(name: string, value: unknown): string {
  const isRealDate = DATE_ARGUMENTS.includes(name) && typeof value === 'string' && isRealIsoDate(value);
  return isRealDate ? `${name}:${value}` : name;
}

export function describeToolOutput(output: string): string {
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const list = Object.values(parsed).find(Array.isArray);
  return String(list?.length);
}
