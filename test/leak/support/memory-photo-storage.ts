import type { Photo, PhotoStorage } from '../../../src/services/storage/photo-storage.ts';

export class MemoryPhotoStorage implements PhotoStorage {
  private readonly photos = new Map<string, Photo>();

  async put(key: string, photo: Photo): Promise<void> {
    this.photos.set(key, photo);
  }

  async get(key: string): Promise<Photo | null> {
    return this.photos.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.photos.delete(key);
  }
}
