import type { ToolCall } from '../../services/chat/chat-service.ts';
import { isRealIsoDate } from '../time/is-real-iso-date.ts';

export const NOT_RUN = 'not_run';
const INVALID_ARGUMENTS = 'invalid';

const DATE_ARGUMENTS = ['added_from', 'added_to', 'occurred_from', 'occurred_to'];

export function describeToolCall(call: ToolCall): { tool: string; arguments: string } {
  return { tool: call.name, arguments: describeArguments(call.argumentsJson) };
}

function describeArguments(argumentsJson: string): string {
  const parsed = parseArguments(argumentsJson);
  if (parsed === null) return INVALID_ARGUMENTS;
  return Object.keys(parsed)
    .filter((name) => !isEmptyArgument(parsed[name]))
    .sort()
    .map((name) => describeArgument(name, parsed[name]))
    .join(';');
}

function parseArguments(argumentsJson: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(argumentsJson);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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
  if (parsed['ok'] === false) return 'error';
  const list = Object.values(parsed).find(Array.isArray);
  return String(list?.length);
}
