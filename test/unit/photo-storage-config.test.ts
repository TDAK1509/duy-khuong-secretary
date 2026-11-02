import { describe, expect, it } from 'vitest';
import { loadPhotoStorageConfig } from '../../src/bootstrap/photo-storage-config.ts';

const COMPLETE_ENVIRONMENT: NodeJS.ProcessEnv = {
  PHOTO_STORAGE: 's3',
  S3_ENDPOINT: 'https://r2.test',
  S3_REGION: 'auto',
  S3_BUCKET: 'photos',
  S3_ACCESS_KEY_ID: 'key-id',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('loadPhotoStorageConfig', () => {
  it('lists every missing value by name', () => {
    const result = loadPhotoStorageConfig({ ...COMPLETE_ENVIRONMENT, S3_BUCKET: undefined, S3_REGION: '' });

    expect(result).toEqual({ ok: false, missing: ['S3_REGION', 'S3_BUCKET'] });
  });

  it('reads the values and defaults to virtual-hosted style', () => {
    expect(loadPhotoStorageConfig(COMPLETE_ENVIRONMENT)).toEqual({
      ok: true,
      config: {
        provider: 's3',
        endpoint: 'https://r2.test',
        region: 'auto',
        bucket: 'photos',
        accessKeyId: 'key-id',
        secretAccessKey: 'secret',
        forcePathStyle: false,
      },
    });
  });

  it('reads path style for MinIO', () => {
    const result = loadPhotoStorageConfig({ ...COMPLETE_ENVIRONMENT, S3_FORCE_PATH_STYLE: 'true' });

    expect(result).toMatchObject({ ok: true, config: { forcePathStyle: true } });
  });

  it('refuses a malformed endpoint and names the value', () => {
    expect(() => loadPhotoStorageConfig({ ...COMPLETE_ENVIRONMENT, S3_ENDPOINT: 'nope' })).toThrow(/S3_ENDPOINT/);
  });
});
