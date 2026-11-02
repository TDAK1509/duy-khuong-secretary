import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type GitFixture = {
  directory: string;
  writeFile(relativePath: string, content: string): void;
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

function runGit(directory: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd: directory,
    stdio: 'pipe',
  });
}
