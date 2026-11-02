import { listMutationGatedFiles } from './list-mutation-gated-files.ts';
import { selectShardFiles } from './select-shard-files.ts';

const [shardIndexText, shardCountText] = process.argv.slice(2);
const shardIndex = Number(shardIndexText);
const shardCount = Number(shardCountText);

const shardFiles = selectShardFiles(listMutationGatedFiles(process.cwd()), shardIndex, shardCount);
console.log(shardFiles.join(','));
