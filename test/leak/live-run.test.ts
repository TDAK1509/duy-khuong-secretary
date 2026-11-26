import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ChatResult, ChatService, ToolCall } from '../../src/services/chat/chat-service.ts';
import { LIVE_ATTACK_CASES } from './live/live-attack-cases.ts';
import { runLiveLeak, type LiveRun } from './live/run-live-leak.ts';
import { ATTACK_CASES, findAttackCase } from './support/attack-cases.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { resetDatabase } from './support/reset-database.ts';
import { B_MEMBER_ID, WORKSPACE_A_ID } from './support/seed-ids.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const databases = openLeakDatabases();

let reportDirectory = '';

beforeEach(async () => {
  reportDirectory = await mkdtemp(join(tmpdir(), 'leak-live-test-'));
});

afterEach(() => rm(reportDirectory, { recursive: true, force: true }));

after(() => databases.close());

test('the live run passes end to end when the model leaks nothing', async () => {
  const exitCode = await runLiveLeak(buildRun(() => new ScriptedChatModel(ATTACK_CASES)));
  assert.equal(exitCode, 0);
  const report = await readReport();
  assert.deepEqual(report.results.map(({ verdict }) => verdict), LIVE_ATTACK_CASES.map(() => 'PASS'));
});

test('the live run exits 1 when the model reply holds B data', async () => {
  const firstCase = LIVE_ATTACK_CASES.filter(({ id }) => id === 'E01');
  const exitCode = await runLiveLeak({ ...buildRun(() => createFixedReplyChat('LEAK-B-1')), cases: firstCase });
  assert.equal(exitCode, 1);
  assert.deepEqual((await readReport()).results.map(({ verdict }) => verdict), ['FAIL']);
});

test('the live run exits 1 when the model crashes after it changed a B row', async () => {
  const firstCase = LIVE_ATTACK_CASES.filter(({ id }) => id === 'E01');
  const exitCode = await runLiveLeak({ ...buildRun(createCrashingChatAfterChangingB), cases: firstCase });
  assert.equal(exitCode, 1);
  assert.deepEqual((await readReport()).results.map(({ verdict }) => verdict), ['FAIL']);
});

function createCrashingChatAfterChangingB(): ChatService {
  const respond = async (): Promise<never> => {
    await databases.owner.query(`UPDATE memberships SET display_name = 'TARGET-B-CHANGED' WHERE id = $1`, [B_MEMBER_ID]);
    throw new Error('the model stopped');
  };
  return { model: 'leak-test-crashing', respond };
}

test('the live run stops with exit 2 when the last case pushes the cost past the cap', async () => {
  const firstCase = LIVE_ATTACK_CASES.filter(({ id }) => id === 'E01');
  const exitCode = await runLiveLeak({ ...buildRun(createCostlyChat), cases: firstCase, maxUsd: 0.01 });
  const report = await readReport();
  assert.deepEqual(report.results.map(({ verdict }) => verdict), ['PASS']);
  assert.equal(report.summary.budgetStopped, true);
  assert.equal(exitCode, 2);
});

function createCostlyChat(): ChatService {
  const usage = { input: 10_000, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  return { model: 'gpt-6.1-sol', respond: async () => ({ ok: true, reply: { kind: 'text', text: 'SAFE-A-DRIVER ok' }, usage }) };
}

test('the live run exits 1 when a stored file holds B data and the model crashes afterward', async () => {
  const firstCase = LIVE_ATTACK_CASES.filter(({ id }) => id === 'E01');
  const exitCode = await runLiveLeak({ ...buildRun(createChatThatStoresLeakThenCrashes), cases: firstCase });
  assert.equal(exitCode, 1);
  assert.deepEqual((await readReport()).results.map(({ verdict }) => verdict), ['FAIL']);
});

function createChatThatStoresLeakThenCrashes(): ChatService {
  let roundCount = 0;
  const respond = async (): Promise<ChatResult> => {
    roundCount += 1;
    if (roundCount > 1) throw new Error('the model stopped');
    return { ok: true, reply: { kind: 'tool_calls', calls: [buildLeakingExportCall()], replayItems: [] }, usage: null };
  };
  return { model: 'leak-test-storing', respond };
}

function buildLeakingExportCall(): ToolCall {
  const { arguments: exportArguments } = findAttackCase('export_report_xlsx');
  const json = JSON.stringify({ ...exportArguments, rows: [['LEAK-B-CELL']] });
  return { id: 'leak-test-export', name: 'export_report_xlsx', argumentsJson: json.replace('LEAK-B-CELL', 'LEAK\\u002dB-CELL') };
}

test('the live run refuses to start without a model key', async () => {
  await resetDatabase(databases.owner);
  await databases.owner.query(`UPDATE workspaces SET name = 'SAFE-A-SENTINEL' WHERE id = $1`, [WORKSPACE_A_ID]);
  const outcome = startLiveRunWithoutModelKey();
  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /LLM_API_KEY/);
  const { rows } = await databases.owner.query('SELECT name FROM workspaces WHERE id = $1', [WORKSPACE_A_ID]);
  assert.deepEqual(rows, [{ name: 'SAFE-A-SENTINEL' }]);
});

function startLiveRunWithoutModelKey(): SpawnSyncReturns<string> {
  const environment: NodeJS.ProcessEnv = { ...process.env, CHAT_PROVIDER: 'openai-compatible', LLM_BASE_URL: 'https://llm.invalid/v1', LLM_MODEL: 'gpt-6.1-sol' };
  delete environment['LLM_API_KEY'];
  return spawnSync(process.execPath, ['test/leak/live/main-live-leak.ts'], { cwd: REPOSITORY_ROOT, env: environment, encoding: 'utf8' });
}

function createFixedReplyChat(text: string): ChatService {
  return { model: 'leak-test-fixed-reply', respond: async () => ({ ok: true, reply: { kind: 'text', text }, usage: null }) };
}

function buildRun(createChat: () => ChatService): LiveRun {
  const model = { name: 'leak-test-scripted-model', reasoningEffort: 'none', createChat };
  return { cases: LIVE_ATTACK_CASES, runs: 1, maxUsd: 5, model, databases, reportDirectory, commitSha: 'test-commit', log: () => undefined };
}

async function readReport(): Promise<{ summary: { budgetStopped: boolean }; results: { verdict: string }[] }> {
  return JSON.parse(await readFile(join(reportDirectory, 'report.json'), 'utf8'));
}
