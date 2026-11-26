import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildChatServices } from '../../../src/bootstrap/from-env.ts';
import { loadChatConfig } from '../../../src/bootstrap/chat-config.ts';
import { openLeakDatabases } from '../support/leak-databases.ts';
import { EXIT_SETUP_PROBLEM, type ExitCode } from './decide-exit-code.ts';
import { readLiveSettings } from './read-live-settings.ts';
import { runLiveLeak, type LiveModel } from './run-live-leak.ts';

const REPORT_DIRECTORY = fileURLToPath(new URL('../../../reports/leak-live', import.meta.url));

export async function startLiveLeak(environment: NodeJS.ProcessEnv): Promise<ExitCode> {
  try {
    return await runConfiguredLeak(environment);
  } catch (error) {
    console.error(`leak-live setup problem: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT_SETUP_PROBLEM;
  }
}

async function runConfiguredLeak(environment: NodeJS.ProcessEnv): Promise<ExitCode> {
  const model = buildProductionAdminChatModel(environment);
  const settings = readLiveSettings(environment);
  const databases = openLeakDatabases(environment);
  try {
    return await runLiveLeak({ ...settings, model, databases, reportDirectory: REPORT_DIRECTORY, commitSha: readCommitSha(), log: console.log });
  } finally {
    await databases.close();
  }
}

function buildProductionAdminChatModel(environment: NodeJS.ProcessEnv): LiveModel {
  const loaded = loadChatConfig(environment);
  if (!loaded.ok) throw new Error(`these environment variables are missing: ${loaded.missing.join(', ')}`);
  const chat = buildChatServices(loaded.config).adminChat;
  const { model, reasoningEffort } = loaded.config.tasks.adminChat;
  return { name: model, reasoningEffort: reasoningEffort ?? 'none', createChat: () => chat };
}

function readCommitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
