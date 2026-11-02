import { GetObjectCommand, NoSuchKey, PutObjectCommand } from '@aws-sdk/client-s3';
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
    const client: S3Sender = {
      send: async (command) => {
        commands.push(command);
        return {};
      },
    };
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

  it('returns the stored bytes and content type', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const commands: unknown[] = [];
    const client: S3Sender = {
      send: async (command) => {
        commands.push(command);
        return { ContentType: 'image/png', Body: { transformToByteArray: async () => pngBytes } };
      },
    };

    const photo = await new S3PhotoStorage(SETTINGS, client).get('w1/m1.png');

    expect(photo).toEqual({ bytes: pngBytes, contentType: 'image/png' });
    expect(commands[0]).toBeInstanceOf(GetObjectCommand);
    expect((commands[0] as GetObjectCommand).input).toEqual({ Bucket: 'photos', Key: 'w1/m1.png' });
  });

  it('returns null for a missing object', async () => {
    const client: S3Sender = {
      send: async () => {
        throw new NoSuchKey({ message: 'no such key', $metadata: {} });
      },
    };

    expect(await new S3PhotoStorage(SETTINGS, client).get('w1/missing.jpg')).toBeNull();
  });
});
