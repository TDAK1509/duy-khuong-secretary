import type { AttachablePhoto } from '../records/find-record-photos.ts';

export const MAX_ATTACHED_PHOTOS = 4;

export class PhotoAttachments {
  private readonly photos: AttachablePhoto[] = [];

  add(photos: AttachablePhoto[]): number {
    const accepted = photos.slice(0, MAX_ATTACHED_PHOTOS - this.photos.length);
    this.photos.push(...accepted);
    return accepted.length;
  }

  list(): AttachablePhoto[] {
    return [...this.photos];
  }
}
