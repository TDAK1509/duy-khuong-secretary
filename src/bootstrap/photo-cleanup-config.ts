import { z } from 'zod';

const environmentSchema = z.object({
  PHOTO_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(0, 'PHOTO_RETENTION_DAYS must be 0 or positive')
    .default(180),
  PHOTO_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
});

export type PhotoCleanupConfig = {
  retentionDays: number;
  batchSize: number;
};

export function loadPhotoCleanupConfig(environment: NodeJS.ProcessEnv): PhotoCleanupConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  }
  return {
    retentionDays: parsed.data.PHOTO_RETENTION_DAYS,
    batchSize: parsed.data.PHOTO_CLEANUP_BATCH_SIZE,
  };
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
