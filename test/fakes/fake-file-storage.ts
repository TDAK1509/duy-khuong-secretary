import type { FileStorage, StoredFile } from '../../src/services/storage/file-storage.ts';

export class FakeFileStorage implements FileStorage {
  private readonly files = new Map<string, StoredFile>();
  isFailing = false;

  async put(key: string, file: StoredFile): Promise<void> {
    if (this.isFailing) throw new Error('the fake file storage is set to fail');
    this.files.set(key, file);
  }

  async get(key: string): Promise<StoredFile | null> {
    return this.files.get(key) ?? null;
  }

  listKeys(): string[] {
    return [...this.files.keys()];
  }
}
