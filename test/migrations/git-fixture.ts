import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type GitFixture = {
  directory: string;
  writeFile(relativePath: string, content: string): void;
  renameFile(fromPath: string, toPath: string): void;
  removeFile(relativePath: string): void;
  commitAll(message: string): void;
  startBranch(name: string): void;
  remove(): void;
};

export function createGitFixture(): GitFixture {
  const directory = mkdtempSync(join(tmpdir(), 'migration-fixture-'));
  const git = (...args: string[]) => runGit(directory, args);
  git('init', '--initial-branch=main');
  return {
    directory,
    writeFile: (relativePath, content) => writeFileIn(directory, relativePath, content),
    renameFile: (fromPath, toPath) => renameSync(join(directory, fromPath), join(directory, toPath)),
    removeFile: (relativePath) => rmSync(join(directory, relativePath)),
    commitAll: (message) => {
      git('add', '--all');
      git('commit', '--message', message);
    },
    startBranch: (name) => git('switch', '--create', name),
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function writeFileIn(directory: string, relativePath: string, content: string): void {
  const absolutePath = join(directory, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

const FIXTURE_GIT_CONFIG = [
  'user.name=Test',
  'user.email=test@example.com',
  'commit.gpgsign=false',
  'core.hooksPath=/dev/null',
];

function runGit(directory: string, args: string[]): void {
  const configArgs = FIXTURE_GIT_CONFIG.flatMap((setting) => ['-c', setting]);
  execFileSync('git', [...configArgs, ...args], { cwd: directory, stdio: 'pipe' });
}
