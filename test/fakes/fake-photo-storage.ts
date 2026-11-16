import type { Photo, PhotoStorage } from '../../src/services/storage/photo-storage.ts';

export class FakePhotoStorage implements PhotoStorage {
  private readonly photos = new Map<string, Photo>();
  readonly deletedKeys: string[] = [];
  isFailing = false;
  isDeleteFailing = false;

  async put(key: string, photo: Photo): Promise<void> {
    if (this.isFailing) throw new Error('the fake photo storage is set to fail');
    this.photos.set(key, photo);
  }

  listKeys(): string[] {
    return [...this.photos.keys()];
  }

  async get(key: string): Promise<Photo | null> {
    return this.photos.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    if (this.isDeleteFailing) throw new Error('the fake photo storage delete is set to fail');
    this.deletedKeys.push(key);
    this.photos.delete(key);
  }
}
