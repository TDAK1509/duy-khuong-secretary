import type { TokenUsage } from '../usage/token-usage.ts';
import type { Photo } from '../storage/photo-storage.ts';

export type JsonSchema = Record<string, unknown>;

export interface ReaderRequest {
  system: string;
  text: string | null;
  image: Photo | null;
  schemaName: string;
  schema: JsonSchema;
}

export type ReaderResult =
  | { ok: true; json: unknown; usage: TokenUsage | null }
  | { ok: false; reason: 'invalid_output'; usage: TokenUsage | null }
  | { ok: false; reason: 'timeout' | 'unavailable' };

export interface ReaderService {
  readonly model: string;
  read(request: ReaderRequest): Promise<ReaderResult>;
}
