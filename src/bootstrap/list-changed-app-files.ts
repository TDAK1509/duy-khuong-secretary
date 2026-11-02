import { execFileSync } from 'node:child_process';

const APP_FILES_PATHSPEC = ':(glob)src/app/**/*.ts';

export function listChangedAppFiles(repositoryDirectory: string, baseRef: string): string[] {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `${baseRef}...HEAD`, '--', APP_FILES_PATHSPEC],
    { cwd: repositoryDirectory, encoding: 'utf8' },
  );
  return output.split('\n').filter((line) => line !== '');
}
