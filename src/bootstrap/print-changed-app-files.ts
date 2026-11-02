import { listChangedAppFiles } from './list-changed-app-files.ts';

const baseRef = process.argv[2];
if (baseRef === undefined) {
  console.error('usage: node src/bootstrap/print-changed-app-files.ts <base-ref>');
  process.exit(2);
}

console.log(listChangedAppFiles(process.cwd(), baseRef).join(','));
