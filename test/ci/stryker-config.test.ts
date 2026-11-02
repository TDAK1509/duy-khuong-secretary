import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MUTATION_GATED_DIRECTORIES } from '../../src/bootstrap/list-mutation-gated-files.ts';

describe('stryker.config.json', () => {
  const config = JSON.parse(readFileSync(resolve('stryker.config.json'), 'utf8'));

  it('mutates the directories the shards list', () => {
    expect(config.mutate).toEqual(MUTATION_GATED_DIRECTORIES.map((directory) => `${directory}/**/*.ts`));
  });
});
