import { afterEach, describe, expect, it } from 'vitest';
import { listMutationGatedFiles } from '../../src/bootstrap/list-mutation-gated-files.ts';
import { createProjectFixture, type ProjectFixture } from './project-fixture.ts';

describe('listMutationGatedFiles', () => {
  const fixtures: ProjectFixture[] = [];

  afterEach(() => {
    fixtures.splice(0).forEach((fixture) => fixture.remove());
  });

  it('lists the typescript files of the access scope and of the tool executors, sorted', () => {
    const directory = createProjectWith([
      'src/app/admin-chat/tools/search-records-tool.ts',
      'src/app/access/access-scope.ts',
      'src/app/admin-chat/tools/nested/helper.ts',
      'src/app/access/to-database-scope.ts',
    ]);

    expect(listMutationGatedFiles(directory)).toEqual([
      'src/app/access/access-scope.ts',
      'src/app/access/to-database-scope.ts',
      'src/app/admin-chat/tools/nested/helper.ts',
      'src/app/admin-chat/tools/search-records-tool.ts',
    ]);
  });

  it('leaves out test files, other file types and the rest of the app', () => {
    const directory = createProjectWith([
      'src/app/access/access-scope.ts',
      'src/app/access/access-scope.test.ts',
      'src/app/access/notes.md',
      'src/app/admin-chat/handle-message.ts',
      'src/app/admin-chat/tools/data.json',
      'src/services/clock.ts',
    ]);

    expect(listMutationGatedFiles(directory)).toEqual(['src/app/access/access-scope.ts']);
  });

  function createProjectWith(files: string[]): string {
    const fixture = createProjectFixture(files);
    fixtures.push(fixture);
    return fixture.directory;
  }
});
