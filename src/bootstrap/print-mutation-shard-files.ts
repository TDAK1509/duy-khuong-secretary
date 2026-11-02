import { listMutationGatedFiles } from './list-mutation-gated-files.ts';
import { selectShardFiles } from './select-shard-files.ts';

const [shardIndexText, shardCountText] = process.argv.slice(2);
const shardIndex = Number(shardIndexText);
const shardCount = Number(shardCountText);
if (!isValidShard(shardIndex, shardCount)) {
  console.error('usage: node src/bootstrap/print-mutation-shard-files.ts <shard-index> <shard-count>');
  process.exit(2);
}

const shardFiles = selectShardFiles(listMutationGatedFiles(process.cwd()), shardIndex, shardCount);
console.log(shardFiles.join(','));

function isValidShard(index: number, count: number): boolean {
  return Number.isInteger(index) && Number.isInteger(count) && index >= 1 && index <= count;
}
