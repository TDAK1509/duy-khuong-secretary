import { checkMergedMigrations } from './check-merged-migrations.ts';

const baseRef = process.argv[2];
if (baseRef === undefined) {
  console.error('usage: node src/bootstrap/check-migrations.ts <base-ref>');
  process.exit(2);
}

const problems = checkMergedMigrations(process.cwd(), baseRef);
problems.forEach((problem) => console.error(`[migrations] ${problem}`));
if (problems.length > 0) {
  process.exit(1);
}
console.log('[migrations] no merged migration changed');
