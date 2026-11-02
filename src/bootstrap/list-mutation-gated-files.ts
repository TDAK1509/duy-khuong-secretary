import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MUTATION_GATED_DIRECTORIES = ['src/app/access', 'src/app/admin-chat/tools'];

export function listMutationGatedFiles(repositoryDirectory: string): string[] {
  return MUTATION_GATED_DIRECTORIES.flatMap((directory) => listTypescriptFiles(repositoryDirectory, directory)).sort();
}

function listTypescriptFiles(repositoryDirectory: string, directory: string): string[] {
  return readdirSync(join(repositoryDirectory, directory), { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `${directory}/${path}`);
}
