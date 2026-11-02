import { describe, expect, it } from 'vitest';
import type { PhotoStorage } from '../../src/services/storage/photo-storage.ts';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

export function describePhotoStorageContract(name: string, makeStorage: () => PhotoStorage): void {
  describe(`${name} as a photo storage`, () => {
    it('returns what was put', async () => {
      const storage = makeStorage();

      await storage.put('a/b.jpg', { bytes: JPEG_BYTES, contentType: 'image/jpeg' });

      expect(await storage.get('a/b.jpg')).toEqual({ bytes: JPEG_BYTES, contentType: 'image/jpeg' });
    });

    it('returns null for an unknown key', async () => {
      expect(await makeStorage().get('a/missing.jpg')).toBeNull();
    });
  });
}
