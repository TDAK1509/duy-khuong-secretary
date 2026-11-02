import { loadReaderConfig } from './reader-config.ts';

const configResult = loadReaderConfig(process.env);
if (!configResult.ok) {
  console.error(`readers is not configured: missing ${configResult.missing.join(', ')}.`);
  process.exit(1);
}
