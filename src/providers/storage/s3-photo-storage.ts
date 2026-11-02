import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Photo, PhotoStorage } from '../../services/storage/photo-storage.ts';

export type S3PhotoStorageSettings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type S3Answer = {
  ContentType?: string | undefined;
  Body?: { transformToByteArray(): Promise<Uint8Array> } | undefined;
};

export type S3Sender = { send(command: PutObjectCommand | GetObjectCommand): Promise<S3Answer> };

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

  async get(key: string): Promise<Photo | null> {
    const answer = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return { bytes: await readBody(answer), contentType: readContentType(answer) };
  }
}

async function readBody(answer: S3Answer): Promise<Uint8Array> {
  if (!answer.Body) throw new Error('the stored photo has no body');
  return answer.Body.transformToByteArray();
}

function readContentType(answer: S3Answer): Photo['contentType'] {
  if (answer.ContentType === 'image/jpeg' || answer.ContentType === 'image/png') return answer.ContentType;
  throw new Error('the stored photo has an unknown content type');
}

function buildClient(settings: S3PhotoStorageSettings): S3Client {
  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: settings.forcePathStyle,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
}
