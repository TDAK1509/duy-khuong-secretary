import { execFileSync } from 'node:child_process';

const MIGRATIONS_FOLDER = 'src/app/db/migrations/';
const CHANGE_STATUSES_THAT_TOUCH_MERGED_FILES = ['M', 'D'];

export function checkMergedMigrations(repositoryDirectory: string, baseRef: string): string[] {
  return listChangedFiles(repositoryDirectory, baseRef)
    .filter(({ status }) => CHANGE_STATUSES_THAT_TOUCH_MERGED_FILES.includes(status))
    .map(({ path }) => `${path} is already merged and must not be changed, renamed or deleted`);
}

type ChangedFile = { status: string; path: string };

function listChangedFiles(repositoryDirectory: string, baseRef: string): ChangedFile[] {
  const output = execFileSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseRef}...HEAD`, '--', MIGRATIONS_FOLDER],
    { cwd: repositoryDirectory, encoding: 'utf8' },
  );
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [status = '', path = ''] = line.split('\t');
      return { status, path };
    });
}
