import type { FileStorage } from '../../../src/services/storage/file-storage.ts';

export type StoredFile = { key: string; bytes: Uint8Array };

export class FakeFileStorage implements FileStorage {
  private readonly files = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.files.set(key, bytes);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.files.get(key) ?? null;
  }

  async presignedUrl(key: string): Promise<string> {
    return `https://files.leak-test.invalid/${key}`;
  }

  listStoredFiles(): StoredFile[] {
    return [...this.files].map(([key, bytes]) => ({ key, bytes }));
  }
}
