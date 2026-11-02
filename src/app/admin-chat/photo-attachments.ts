import type { AttachablePhoto } from '../records/find-record-photos.ts';

export const MAX_ATTACHED_PHOTOS = 4;

export class PhotoAttachments {
  private readonly photos = new Map<string, AttachablePhoto>();

  add(photos: AttachablePhoto[]): number {
    const before = this.photos.size;
    for (const photo of photos) {
      if (this.photos.size === MAX_ATTACHED_PHOTOS) break;
      if (!this.photos.has(photo.sourceMessageId)) this.photos.set(photo.sourceMessageId, photo);
    }
    return this.photos.size - before;
  }

  list(): AttachablePhoto[] {
    return [...this.photos.values()];
  }
}
