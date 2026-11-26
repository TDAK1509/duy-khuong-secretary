import { startLiveLeak } from './start-live-leak.ts';

process.exitCode = await startLiveLeak(process.env);
