export function selectShardFiles(files: string[], shardIndex: number, shardCount: number): string[] {
  return [...files].sort().filter((_, position) => position % shardCount === shardIndex - 1);
}
