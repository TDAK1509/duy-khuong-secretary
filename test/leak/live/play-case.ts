import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { answerAdminQuestion, answerStoredChanges, observeTurnEffects, playAdminTurn, type AnswerStep, type PlayedTurn } from '../support/admin-chat-session.ts';
import { findBotReplyText } from '../support/assert-reply-published.ts';
import { markAdminAsJoinedBeforeHistory } from '../support/prepare-chat-seed.ts';
import { resetDatabase } from '../support/reset-database.ts';
import { WORKSPACE_A_ID } from '../support/seed-ids.ts';
import { snapshotWorkspace, type WorkspaceSnapshot } from '../support/snapshot-workspace.ts';
import { snapshotWorkspaceB } from '../support/snapshot-workspace-b.ts';
import { fillPlaceholders } from './fill-placeholders.ts';
import { findUuids } from './find-uuids.ts';
import type { LiveAttackCase } from './live-attack-case.ts';
import { countHeldChanges, listReplyPhotoKeys } from './read-case-state.ts';
import { readSeedPlaceholders } from './read-seed-placeholders.ts';
import type { RecordingChat } from './recording-chat.ts';
import type { RecordedCase } from './score-case.ts';

const CONFIRMATION_TEXT = 'Có';

export type CasePlay = { owner: PostgresPool; database: PostgresPool; chat: RecordingChat; attackCase: LiveAttackCase };

type Transcript = { observations: unknown[]; replies: string[]; replyPhotoKeys: string[]; heldChanges: number; turnCount: number };

type CaseBackdrop = { knownAIds: string[]; workspaceBBefore: WorkspaceSnapshot; workspaceBAfter: WorkspaceSnapshot };

export async function playCase(play: CasePlay): Promise<RecordedCase> {
  const { owner, attackCase } = play;
  await seedCase(owner, attackCase);
  const knownAIds = await listKnownAIds(owner);
  const workspaceBBefore = await snapshotWorkspaceB(owner);
  const transcript = await playTurns(play, await fillTurns(owner, attackCase));
  const workspaceBAfter = await snapshotWorkspaceB(owner);
  return recordCase(play, transcript, { knownAIds, workspaceBBefore, workspaceBAfter });
}

async function seedCase(owner: PostgresPool, attackCase: LiveAttackCase): Promise<void> {
  await resetDatabase(owner);
  await markAdminAsJoinedBeforeHistory(owner);
  await attackCase.prepare?.(owner);
}

async function listKnownAIds(owner: PostgresPool): Promise<string[]> {
  const snapshot = await snapshotWorkspace(owner, WORKSPACE_A_ID);
  return [...new Set(findUuids(JSON.stringify(snapshot)))];
}

async function fillTurns(owner: PostgresPool, attackCase: LiveAttackCase): Promise<string[]> {
  const values = await readSeedPlaceholders(owner);
  return attackCase.turns.map((turn) => fillPlaceholders(turn, values));
}

async function playTurns(play: CasePlay, texts: string[]): Promise<Transcript> {
  const transcript: Transcript = { observations: [], replies: [], replyPhotoKeys: [], heldChanges: 0, turnCount: 0 };
  for (const text of texts) {
    await playTurn(play, transcript, text, answerAdminQuestion);
    await confirmHeldChanges(play, transcript);
  }
  return transcript;
}

async function confirmHeldChanges(play: CasePlay, transcript: Transcript): Promise<void> {
  const held = await countHeldChanges(play.owner);
  if (held === 0) return;
  transcript.heldChanges += held;
  await playTurn(play, transcript, CONFIRMATION_TEXT, answerStoredChanges);
}

async function playTurn(play: CasePlay, transcript: Transcript, text: string, answer: AnswerStep): Promise<void> {
  const { owner, database, chat } = play;
  transcript.turnCount += 1;
  const played = await playAdminTurn({ owner, database, chat, text, turnNumber: transcript.turnCount }, answer);
  transcript.observations.push(...(await observeTurnEffects(owner, played)));
  transcript.replies.push(readReply(played));
  transcript.replyPhotoKeys.push(...(await listReplyPhotoKeys(owner, played.session.message.id)));
}

function readReply({ rowsWritten, session }: PlayedTurn): string {
  const reply = findBotReplyText(rowsWritten, session.message.id);
  if (reply === undefined) throw new Error(`the admin turn "${session.message.text}" stored no bot reply`);
  return reply;
}

function recordCase({ chat, attackCase }: CasePlay, transcript: Transcript, backdrop: CaseBackdrop): RecordedCase {
  return {
    observations: [...transcript.observations, chat.requests, chat.results],
    replies: transcript.replies,
    replyPhotoKeys: transcript.replyPhotoKeys,
    toolCalls: chat.toolCalls,
    providerFailures: chat.providerFailures,
    heldChanges: transcript.heldChanges,
    rounds: chat.requests.length,
    costUsd: chat.costUsd,
    answerMarker: attackCase.answerMarker,
    ...backdrop,
  };
}
