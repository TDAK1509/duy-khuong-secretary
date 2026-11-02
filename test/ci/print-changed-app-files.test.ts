import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitFixture, type GitFixture } from '../migrations/git-fixture.ts';

const PRINT_SCRIPT = resolve('src/bootstrap/print-changed-app-files.ts');

describe('print-changed-app-files', () => {
  const fixtures: GitFixture[] = [];

  afterEach(() => {
    fixtures.splice(0).forEach((fixture) => fixture.remove());
  });

  it('prints the comma separated app files of the requested shard', () => {
    const fixture = createFixtureWithChangedFiles(['a', 'b', 'c']);

    expect(printShard(fixture, 1, 2)).toBe('src/app/a.ts,src/app/c.ts');
    expect(printShard(fixture, 2, 2)).toBe('src/app/b.ts');
  });

  function createFixtureWithChangedFiles(names: string[]): GitFixture {
    const fixture = createGitFixture();
    fixtures.push(fixture);
    fixture.writeFile('README.md', 'notes\n');
    fixture.commitAll('merged files');
    fixture.startBranch('feature');
    names.forEach((name) => fixture.writeFile(`src/app/${name}.ts`, `export const ${name} = 1;\n`));
    fixture.commitAll('add app files');
    return fixture;
  }

  function printShard(fixture: GitFixture, shardIndex: number, shardCount: number): string {
    return execFileSync('node', [PRINT_SCRIPT, 'main', String(shardIndex), String(shardCount)], {
      cwd: fixture.directory,
      encoding: 'utf8',
    }).trim();
  }
});
