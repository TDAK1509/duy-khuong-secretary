export type SheetExtension = 'csv' | 'xlsx';

export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  presignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
