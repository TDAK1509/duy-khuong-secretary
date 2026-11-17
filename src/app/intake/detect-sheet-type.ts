import type { SheetExtension } from '../../services/storage/file-storage.ts';

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const SAMPLE_SIZE = 512;

export function detectSheetType(fileName: string, bytes: Uint8Array): SheetExtension | null {
  const extension = readExtension(fileName);
  if (extension === 'csv' && looksLikeCsv(bytes)) return 'csv';
  if (extension === 'xlsx' && startsWith(bytes, ZIP_MAGIC)) return 'xlsx';
  return null;
}

function readExtension(fileName: string): SheetExtension | null {
  const trimmed = fileName.trim().toLowerCase();
  if (trimmed.endsWith('.csv')) return 'csv';
  if (trimmed.endsWith('.xlsx')) return 'xlsx';
  return null;
}

function looksLikeCsv(bytes: Uint8Array): boolean {
  if (startsWith(bytes, ZIP_MAGIC)) return false;
  const sample = bytes.slice(startsWith(bytes, UTF8_BOM) ? UTF8_BOM.length : 0, SAMPLE_SIZE);
  return sample.every(isTextByte);
}

function isTextByte(byte: number): boolean {
  return byte === 0x09 || byte === 0x0a || byte === 0x0d || byte >= 0x20;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}
