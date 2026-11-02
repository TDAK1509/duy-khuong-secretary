import { PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3PhotoStorage, type S3Sender } from '../../src/providers/storage/s3-photo-storage.ts';

const SETTINGS = {
  endpoint: 'https://r2.test',
  region: 'auto',
  bucket: 'photos',
  accessKeyId: 'key-id',
  secretAccessKey: 'secret',
  forcePathStyle: false,
};

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe('S3PhotoStorage', () => {
  it('puts the object with its bucket, key and content type', async () => {
    const commands: unknown[] = [];
    const client: S3Sender = { send: async (command) => void commands.push(command) };
    const storage = new S3PhotoStorage(SETTINGS, client);

    await storage.put('w1/m1.jpg', { bytes: JPEG_BYTES, contentType: 'image/jpeg' });

    expect(commands).toHaveLength(1);
    const [command] = commands;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: 'photos',
      Key: 'w1/m1.jpg',
      ContentType: 'image/jpeg',
      Body: JPEG_BYTES,
    });
  });
});
