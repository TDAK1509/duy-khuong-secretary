import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const expectedAnswersSchema = z.record(
  z.string(),
  z.object({ amount_vnd: z.number().int(), occurred_on: z.string() }),
);

export type ExpectedAnswers = z.infer<typeof expectedAnswersSchema>;

export async function loadExpectedAnswers(folderPath: string): Promise<ExpectedAnswers | null> {
  try {
    const content = await readFile(join(folderPath, 'expected.json'), 'utf8');
    return expectedAnswersSchema.parse(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
