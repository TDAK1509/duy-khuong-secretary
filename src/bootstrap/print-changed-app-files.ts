import { listChangedAppFiles } from './list-changed-app-files.ts';
import { selectShardFiles } from './select-shard-files.ts';

const [baseRef, shardIndexText, shardCountText] = process.argv.slice(2);
const shardIndex = Number(shardIndexText);
const shardCount = Number(shardCountText);
if (baseRef === undefined || !isValidShard(shardIndex, shardCount)) {
  console.error('usage: node src/bootstrap/print-changed-app-files.ts <base-ref> <shard-index> <shard-count>');
  process.exit(2);
}

const shardFiles = selectShardFiles(listChangedAppFiles(process.cwd(), baseRef), shardIndex, shardCount);
console.log(shardFiles.join(','));

function isValidShard(index: number, count: number): boolean {
  return Number.isInteger(index) && Number.isInteger(count) && index >= 1 && index <= count;
}
