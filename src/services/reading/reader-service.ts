import type { Photo } from '../storage/photo-storage.ts';

export type JsonSchema = Record<string, unknown>;

export interface ReaderRequest {
  system: string;
  text: string | null;
  image: Photo | null;
  schemaName: string;
  schema: JsonSchema;
}

export type TokenCount = number | 'unknown';

export type TokenUsage = { input: TokenCount; output: TokenCount; reasoning: TokenCount };

export type ReaderResult =
  | { ok: true; json: unknown; usage?: TokenUsage }
  | { ok: false; reason: 'invalid_output'; usage?: TokenUsage }
  | { ok: false; reason: 'timeout' | 'unavailable' };

export interface ReaderService {
  read(request: ReaderRequest): Promise<ReaderResult>;
}
