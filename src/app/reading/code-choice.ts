import { z } from 'zod';
import { itemSchema } from './reading.ts';

const codeChoiceSchema = z.strictObject({ item: itemSchema, codes: z.array(z.string()) });

export type CodeChoice = z.infer<typeof codeChoiceSchema>;

export function readStoredCodeChoice(stored: unknown): CodeChoice | null {
  return stored === null ? null : codeChoiceSchema.parse(stored);
}
