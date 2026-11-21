import type { FileStorage } from '../../services/storage/file-storage.ts';
import type { FileClaim } from '../sheet-files/file-claims.ts';

export class FileBytesMissingError extends Error {
  constructor(fileId: string) {
    super(`the stored bytes of file ${fileId} are missing`);
    this.name = 'FileBytesMissingError';
  }
}

export async function readFileBytes(fileStorage: FileStorage, claim: FileClaim): Promise<Uint8Array> {
  const bytes = await fileStorage.get(claim.fileKey);
  if (bytes !== null) return bytes;
  console.error(`[files] bytes missing file=${claim.fileId}`);
  throw new FileBytesMissingError(claim.fileId);
}
