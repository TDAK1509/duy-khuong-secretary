import type { FileStorage } from '../../src/services/storage/file-storage.ts';

type PutCall = { key: string; bytes: Uint8Array; contentType: string };

export class FakeFileStorage implements FileStorage {
  private readonly puts: PutCall[] = [];
  private defaultUrl: string | null = null;

  stubDefaultUrl(url: string): void {
    this.defaultUrl = url;
  }

  listPuts(): PutCall[] {
    return [...this.puts];
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.puts.push({ key, bytes, contentType });
  }

  async presignedUrl(key: string, _expiresInSeconds: number): Promise<string> {
    return this.defaultUrl ?? `https://r2.fake/${key}?X-Amz-Expires=86400`;
  }
}
