import { describe, expect, it } from 'vitest';
import { selectShardFiles } from '../../src/bootstrap/select-shard-files.ts';

describe('selectShardFiles', () => {
  const files = ['src/app/e.ts', 'src/app/a.ts', 'src/app/c.ts', 'src/app/b.ts', 'src/app/d.ts'];

  it('gives shard k of n every nth file of the sorted list, starting at k', () => {
    expect(selectShardFiles(files, 1, 2)).toEqual(['src/app/a.ts', 'src/app/c.ts', 'src/app/e.ts']);
    expect(selectShardFiles(files, 2, 2)).toEqual(['src/app/b.ts', 'src/app/d.ts']);
  });

  it('puts every file in exactly one shard', () => {
    const shardCount = 3;

    const allShards = [1, 2, 3].flatMap((shardIndex) => selectShardFiles(files, shardIndex, shardCount));

    expect(allShards.sort()).toEqual([...files].sort());
  });
});
