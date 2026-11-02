import { afterEach, describe, expect, it } from 'vitest';
import { checkMergedMigrations } from '../../src/bootstrap/check-merged-migrations.ts';
import { createGitFixture, type GitFixture } from './git-fixture.ts';

const MIGRATION_A = 'src/app/db/migrations/0001_a.sql';

describe('checkMergedMigrations', () => {
  const fixtures: GitFixture[] = [];

  afterEach(() => {
    fixtures.splice(0).forEach((fixture) => fixture.remove());
  });

  function createFixtureWithMergedMigration(): GitFixture {
    const fixture = createGitFixture();
    fixtures.push(fixture);
    fixture.writeFile(MIGRATION_A, 'CREATE TABLE a (id int);\n');
    fixture.commitAll('add migration a');
    fixture.startBranch('feature');
    return fixture;
  }

  it('fails when the branch edits a merged migration', () => {
    const fixture = createFixtureWithMergedMigration();
    fixture.writeFile(MIGRATION_A, 'CREATE TABLE a (id bigint);\n');
    fixture.commitAll('edit migration a');

    const problems = checkMergedMigrations(fixture.directory, 'main');

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('0001_a.sql');
  });
});
