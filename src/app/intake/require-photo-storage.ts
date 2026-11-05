import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { IntakeContext } from './intake-context.ts';

export function requirePhotoStorage(context: IntakeContext): PhotoStorage {
  const { photoStorage } = context.dependencies;
  if (photoStorage === null) throw new Error('photo storage is not configured');
  return photoStorage;
}
