import { z } from 'zod';
import type { ToolCall } from '../../../services/chat/chat-service.ts';
import { GUARDED_TOOLS, type GuardedTool } from '../tools/admin-text-guard.ts';

export type StoredCall = { name: GuardedTool; arguments: unknown };

const storedCallsSchema = z.array(z.strictObject({ name: z.enum(GUARDED_TOOLS), arguments: z.unknown() }));

export function readStoredCalls(stored: unknown): StoredCall[] {
  const parsed = storedCallsSchema.safeParse(stored);
  return parsed.success ? parsed.data : [];
}

export function toToolCall({ name, arguments: callArguments }: StoredCall, index: number): ToolCall {
  return { id: `confirmed-${index}`, name, argumentsJson: JSON.stringify(callArguments) };
}
