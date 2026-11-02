import { z } from 'zod';

const REQUIRED_NAMES = [
  'PHOTO_STORAGE',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

const environmentSchema = z.object({
  PHOTO_STORAGE: z.literal('s3'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
});

export type PhotoStorageConfig = {
  provider: 's3';
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type PhotoStorageConfigResult = { ok: true; config: PhotoStorageConfig } | { ok: false; missing: string[] };

export function loadPhotoStorageConfig(environment: NodeJS.ProcessEnv): PhotoStorageConfigResult {
  const supplied = dropEmptyValues(environment);
  checkSuppliedValues(supplied);
  const missing = REQUIRED_NAMES.filter((name) => !supplied[name]);
  if (missing.length > 0) return { ok: false, missing };
  const settings = environmentSchema.parse(supplied);
  return {
    ok: true,
    config: {
      provider: settings.PHOTO_STORAGE,
      endpoint: settings.S3_ENDPOINT,
      region: settings.S3_REGION,
      bucket: settings.S3_BUCKET,
      accessKeyId: settings.S3_ACCESS_KEY_ID,
      secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
      forcePathStyle: settings.S3_FORCE_PATH_STYLE === 'true',
    },
  };
}

function checkSuppliedValues(supplied: Record<string, string>): void {
  const parsed = environmentSchema.partial().safeParse(supplied);
  if (!parsed.success) throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
}

function dropEmptyValues(environment: NodeJS.ProcessEnv): Record<string, string> {
  const entries = Object.entries(environment).filter((entry): entry is [string, string] => !!entry[1]);
  return Object.fromEntries(entries);
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
