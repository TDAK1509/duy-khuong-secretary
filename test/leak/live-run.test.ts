import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, beforeEach, test } from 'node:test';
import type { ChatService } from '../../src/services/chat/chat-service.ts';
import { LIVE_ATTACK_CASES } from './live/live-attack-cases.ts';
import { runLiveLeak, type LiveRun } from './live/run-live-leak.ts';
import { listAttackArguments } from './support/attack-case.ts';
import { ATTACK_CASES } from './support/attack-cases.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { collectPassedIds } from './support/leak-check.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';

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

function createFixedReplyChat(text: string): ChatService {
  return { model: 'leak-test-fixed-reply', respond: async () => ({ ok: true, reply: { kind: 'text', text }, usage: null }) };
}

function buildRun(createChat: () => ChatService): LiveRun {
  const model = { name: 'leak-test-scripted-model', reasoningEffort: 'none', passedIds: listScriptedPassedIds(), createChat };
  return { cases: LIVE_ATTACK_CASES, runs: 1, maxUsd: 5, model, databases, reportDirectory, commitSha: 'test-commit', log: () => undefined };
}

function listScriptedPassedIds(): string[] {
  return ATTACK_CASES.flatMap(listAttackArguments).flatMap(collectPassedIds);
}

async function readReport(): Promise<{ results: { verdict: string }[] }> {
  return JSON.parse(await readFile(join(reportDirectory, 'report.json'), 'utf8'));
}
