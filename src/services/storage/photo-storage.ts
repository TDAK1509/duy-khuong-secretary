export interface Photo {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
}

export interface PhotoStorage {
  put(key: string, photo: Photo): Promise<void>;
  get(key: string): Promise<Photo | null>;
}
