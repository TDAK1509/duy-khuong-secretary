import { afterEach, describe, expect, it } from 'vitest';
import { listChangedAppFiles } from '../../src/bootstrap/list-changed-app-files.ts';
import { createGitFixture, type GitFixture } from '../migrations/git-fixture.ts';

describe('listChangedAppFiles', () => {
  const fixtures: GitFixture[] = [];

  afterEach(() => {
    fixtures.splice(0).forEach((fixture) => fixture.remove());
  });

  it('lists the app files the branch changes', () => {
    const fixture = createFixtureWithMergedFiles({
      'src/app/a.ts': 'export const a = 1;\n',
      'src/app/b.ts': 'export const b = 1;\n',
      'src/app/c.ts': 'export const c = 1;\n',
    });
    fixture.writeFile('src/app/a.ts', 'export const a = 2;\n');
    fixture.writeFile('src/app/nested/d.ts', 'export const d = 1;\n');
    fixture.commitAll('change a and add d');

    const files = listChangedAppFiles(fixture.directory, 'main');

    expect(files).toEqual(['src/app/a.ts', 'src/app/nested/d.ts']);
  });

  function createFixtureWithMergedFiles(files: Record<string, string>): GitFixture {
    const fixture = createGitFixture();
    fixtures.push(fixture);
    Object.entries(files).forEach(([path, content]) => fixture.writeFile(path, content));
    fixture.commitAll('merged files');
    fixture.startBranch('feature');
    return fixture;
  }
});
