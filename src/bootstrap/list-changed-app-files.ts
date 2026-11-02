import { execFileSync } from 'node:child_process';

const APP_FILES_PATHSPEC = ':(glob)src/app/**/*.ts';
const MIGRATIONS_PATHSPEC = ':(exclude)src/app/db/migrations';

export function listChangedAppFiles(repositoryDirectory: string, baseRef: string): string[] {
  const output = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      '--no-renames',
      '--diff-filter=d',
      `${baseRef}...HEAD`,
      '--',
      APP_FILES_PATHSPEC,
      MIGRATIONS_PATHSPEC,
    ],
    { cwd: repositoryDirectory, encoding: 'utf8' },
  );
  return output.split('\n').filter((line) => line !== '');
}
