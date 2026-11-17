export type SheetExtension = 'csv' | 'xlsx';

export interface StoredFile {
  bytes: Uint8Array;
  extension: SheetExtension;
}

export interface FileStorage {
  put(key: string, file: StoredFile): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
}
