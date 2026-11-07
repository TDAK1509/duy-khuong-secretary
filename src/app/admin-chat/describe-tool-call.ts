import type { ToolCall } from '../../services/chat/chat-service.ts';
import { ADMIN_TOOLS } from './tools/admin-tools.ts';
import { isRealIsoDate } from '../time/is-real-iso-date.ts';

export const NOT_RUN = 'not_run';
export const THREW = 'threw';
const INVALID_ARGUMENTS = 'invalid';
const NO_COUNT = '-';
const UNKNOWN = 'unknown';

const DATE_ARGUMENTS = ['added_from', 'added_to', 'occurred_from', 'occurred_to'];

export function describeToolCall(call: ToolCall): { tool: string; arguments: string } {
  return { tool: nameTool(call.name), arguments: describeArguments(call.argumentsJson, listDeclaredArguments(call.name)) };
}

function nameTool(name: string): string {
  return ADMIN_TOOLS.some((tool) => tool.name === name) ? name : UNKNOWN;
}

function listDeclaredArguments(toolName: string): string[] {
  const tool = ADMIN_TOOLS.find((candidate) => candidate.name === toolName);
  return Object.keys((tool?.parameters['properties'] ?? {}) as Record<string, unknown>);
}

function describeArguments(argumentsJson: string, declaredArguments: string[]): string {
  const parsed = parseJsonObject(argumentsJson);
  if (parsed === null) return INVALID_ARGUMENTS;
  return Object.keys(parsed)
    .filter((name) => !isEmptyArgument(parsed[name]))
    .map((name) => (declaredArguments.includes(name) ? describeArgument(name, parsed[name]) : UNKNOWN))
    .sort()
    .join(';');
}

function parseJsonObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
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
  const parsed = parseJsonObject(output);
  if (parsed === null) return NO_COUNT;
  if (parsed['ok'] === false) return 'error';
  const list = Object.values(parsed).find(Array.isArray);
  return list === undefined ? NO_COUNT : String(list.length);
}
