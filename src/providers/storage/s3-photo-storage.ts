import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Photo, PhotoStorage } from '../../services/storage/photo-storage.ts';

export type S3PhotoStorageSettings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type S3Sender = { send(command: PutObjectCommand): Promise<unknown> };

export class S3PhotoStorage implements PhotoStorage {
  private readonly bucket: string;
  private readonly client: S3Sender;

  constructor(settings: S3PhotoStorageSettings, client: S3Sender = buildClient(settings)) {
    this.bucket = settings.bucket;
    this.client = client;
  }

  async put(key: string, photo: Photo): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: photo.bytes, ContentType: photo.contentType }),
    );
  }

  async get(): Promise<Photo | null> {
    return null;
  }
}

function buildClient(settings: S3PhotoStorageSettings): S3Client {
  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
}
