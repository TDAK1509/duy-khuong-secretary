import type { Photo } from '../../services/storage/photo-storage.ts';

export type DetectedImage = { photo: Photo; extension: 'jpg' | 'png' };

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) return { photo: { bytes, contentType: 'image/jpeg' }, extension: 'jpg' };
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, position) => bytes[position] === byte);
}
