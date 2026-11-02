import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.url(),
  GIT_COMMIT: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Config = {
  commit: string | null;
  databaseUrl: string;
  port: number;
};

export function loadConfig(environment: NodeJS.ProcessEnv): Config {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  }
  return {
    commit: parsed.data.GIT_COMMIT ?? null,
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
  };
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
