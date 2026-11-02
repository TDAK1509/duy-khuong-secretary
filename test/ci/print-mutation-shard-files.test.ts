import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectFixture, type ProjectFixture } from './project-fixture.ts';

const PRINT_SCRIPT = resolve('src/bootstrap/print-mutation-shard-files.ts');

describe('print-mutation-shard-files', () => {
  const fixtures: ProjectFixture[] = [];

  afterEach(() => {
    fixtures.splice(0).forEach((fixture) => fixture.remove());
  });

  it('prints the comma separated gated files of the requested shard', () => {
    const fixture = createFixtureWithGatedFiles(['a', 'b', 'c']);

    expect(printShard(fixture, 1, 2)).toBe('src/app/access/a.ts,src/app/access/c.ts');
    expect(printShard(fixture, 2, 2)).toBe('src/app/access/b.ts,src/app/admin-chat/tools/tool.ts');
  });

  it('prints nothing for a shard that has no file', () => {
    const fixture = createFixtureWithGatedFiles(['a']);

    expect(printShard(fixture, 3, 4)).toBe('');
  });

  it('refuses a shard outside the shard count', () => {
    const fixture = createFixtureWithGatedFiles(['a']);

    expect(() => printShard(fixture, 5, 4)).toThrow();
  });

  function createFixtureWithGatedFiles(accessNames: string[]): ProjectFixture {
    const fixture = createProjectFixture([
      ...accessNames.map((name) => `src/app/access/${name}.ts`),
      'src/app/admin-chat/tools/tool.ts',
    ]);
    fixtures.push(fixture);
    return fixture;
  }

  function printShard(fixture: ProjectFixture, shardIndex: number, shardCount: number): string {
    return execFileSync('node', [PRINT_SCRIPT, String(shardIndex), String(shardCount)], {
      cwd: fixture.directory,
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();
  }
});
