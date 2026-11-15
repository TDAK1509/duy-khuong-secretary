import { describe, expect, it } from 'vitest';
import { loadPhotoCleanupConfig } from '../../src/bootstrap/photo-cleanup-config.ts';

describe('loadPhotoCleanupConfig', () => {
  it('defaults to 180 days when PHOTO_RETENTION_DAYS is not set', () => {
    const config = loadPhotoCleanupConfig({});

    expect(config.retentionDays).toBe(180);
  });

  it('throws naming PHOTO_RETENTION_DAYS when it is negative', () => {
    expect(() => loadPhotoCleanupConfig({ PHOTO_RETENTION_DAYS: '-1' })).toThrow(/PHOTO_RETENTION_DAYS/);
  });
});
