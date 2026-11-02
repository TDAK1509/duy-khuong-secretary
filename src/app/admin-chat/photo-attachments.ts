import type { AttachablePhoto } from '../records/find-record-photos.ts';

export const MAX_ATTACHED_PHOTOS = 4;

export class PhotoAttachments {
  private readonly photos: AttachablePhoto[] = [];

  add(photos: AttachablePhoto[]): number {
    const before = this.photos.length;
    this.photos.push(...photos);
    return this.photos.length - before;
  }

  list(): AttachablePhoto[] {
    return [...this.photos];
  }
}
