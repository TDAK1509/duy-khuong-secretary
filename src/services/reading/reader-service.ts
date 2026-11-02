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
  | { ok: true; json: unknown }
  | { ok: false; reason: 'timeout' | 'invalid_output' | 'unavailable' };

export interface ReaderService {
  readonly label: string;
  read(request: ReaderRequest): Promise<ReaderResult>;
}
