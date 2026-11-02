import { evaluateReaders } from '../app/reading/evaluate-readers.ts';
import { buildClock, buildReaderSlots } from './from-env.ts';
import { loadReaderConfig } from './reader-config.ts';

const folderPath = process.argv[2];
if (!folderPath) {
  console.error('Usage: node dist/bootstrap/evaluate-readers.js <photo-folder>');
  process.exit(1);
}

const configResult = loadReaderConfig(process.env);
if (!configResult.ok) {
  console.error(`readers is not configured: missing ${configResult.missing.join(', ')}.`);
  process.exit(1);
}

await evaluateReaders({
  folderPath,
  slots: buildReaderSlots(configResult.config),
  clock: buildClock(),
  print: (line) => console.log(line),
});
