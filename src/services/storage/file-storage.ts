export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  presignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
