import type { Photo } from '../../services/storage/photo-storage.ts';

export type DetectedImage = { photo: Photo; extension: 'jpg' | 'png' };

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) return { photo: { bytes, contentType: 'image/jpeg' }, extension: 'jpg' };
  if (startsWith(bytes, PNG_SIGNATURE)) return { photo: { bytes, contentType: 'image/png' }, extension: 'png' };
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, position) => bytes[position] === byte);
}
