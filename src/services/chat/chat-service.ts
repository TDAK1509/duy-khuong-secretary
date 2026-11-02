import type { JsonSchema } from '../reading/reader-service.ts';
import type { Photo } from '../storage/photo-storage.ts';

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export type ChatTurn =
  | { role: 'user'; text: string | null; image: Photo | null }
  | { role: 'assistant'; text: string }
  | { role: 'assistant_tool_calls'; calls: ToolCall[] }
  | { role: 'tool_result'; callId: string; output: string };

export interface ChatRequest {
  system: string;
  turns: ChatTurn[];
  tools: ToolSpec[];
}

export type ChatResult =
  | { ok: true; reply: { kind: 'text'; text: string } | { kind: 'tool_calls'; calls: ToolCall[] } }
  | { ok: false; reason: 'timeout' | 'unavailable' };

export interface ChatService {
  respond(request: ChatRequest): Promise<ChatResult>;
}
