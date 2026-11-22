import type { TokenUsage } from '../usage/token-usage.ts';
import type { Photo } from '../storage/photo-storage.ts';

export type JsonSchema = Record<string, unknown>;

export type ReaderPart = { kind: 'text'; text: string } | { kind: 'image'; photo: Photo };

export interface ReaderRequest {
  system: string;
  userParts: ReaderPart[];
  schemaName: string;
  schema: JsonSchema;
  imageDetail?: 'high';
  useTextModel?: boolean;
}

export function hasImagePart(request: ReaderRequest): boolean {
  return request.userParts.some((part) => part.kind === 'image');
}

export type ReaderResult =
  | { ok: true; json: unknown; usage: TokenUsage | null }
  | { ok: false; reason: 'invalid_output'; usage: TokenUsage | null }
  | { ok: false; reason: 'timeout' | 'unavailable' };

export interface ReaderService {
  chooseModel(request: ReaderRequest): string;
  read(request: ReaderRequest): Promise<ReaderResult>;
}
