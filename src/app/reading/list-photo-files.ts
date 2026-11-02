import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

export async function listPhotoFiles(folderPath: string): Promise<string[]> {
  const names = await readdir(folderPath);
  return names
    .filter((name) => PHOTO_EXTENSIONS.has(extname(name).toLowerCase()))
    .toSorted()
    .map((name) => join(folderPath, name));
}
