import { answerWithChat } from '../../../src/app/admin-chat/answer-with-chat.ts';
import type { ChatMessage } from '../../../src/app/admin-chat/chat-message.ts';
import { settlePendingChanges } from '../../../src/app/admin-chat/changes/settle-pending-changes.ts';
import { toDatabaseScope } from '../../../src/app/access/to-database-scope.ts';
import { scopeDatabase } from '../../../src/app/db/scoped-database.ts';
import type { Database } from '../../../src/app/db/transaction.ts';
import { findIntakeSender } from '../../../src/app/intake/find-intake-sender.ts';
import type { IntakeContext } from '../../../src/app/intake/intake-context.ts';
import { runStoreStage } from '../../../src/app/intake/store-user-message.ts';
import { claimInboundEvent } from '../../../src/app/processing/claim-inbound-event.ts';
import { createStages } from '../../../src/app/processing/stages.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { assertModelReachedEveryTool } from './assert-model-reached-tools.ts';
import { FIXED_CLOCK } from './fixed-clock.ts';
import { collectPassedIds } from './leak-check.ts';
import { listAdminOutboundMessages } from './list-admin-outbound-messages.ts';
import { observeStoredFiles } from './observe-tool-side-effects.ts';
import { FakeFileStorage } from './fake-file-storage.ts';
import { RecordingReader } from './recording-reader.ts';
import { A_ADMIN_SENDER, ADMIN_MESSAGE_ID } from './seed-chat-ids.ts';
import { FIXED_NOW, WORKSPACE_A_ID } from './seed-ids.ts';
import type { ScriptedChatModel } from './scripted-chat-model.ts';
import { listAddedOrChangedRows, snapshotWorkspace } from './snapshot-workspace.ts';
import { STUB_CHANNEL } from './stub-channel.ts';

export type AdminTextRun = { owner: PostgresPool; database: PostgresPool; model: ScriptedChatModel; text: string; passedIds?: string[] };

export type AdminChatTurn = { observations: unknown[]; passedIds: string[] };

type Session = { context: IntakeContext; message: ChatMessage; companyReader: RecordingReader; dropOffReader: RecordingReader; storage: FakeFileStorage };

export function sendAdminQuestion(run: AdminTextRun): Promise<AdminChatTurn> {
  return runTurn(run, ({ context, message }) => answerWithChat(context, message));
}

export function sendAdminReply(run: AdminTextRun): Promise<AdminChatTurn> {
  return runTurn(run, answerStoredChanges);
}

async function answerStoredChanges({ context, message }: Session): Promise<void> {
  const settlement = await settlePendingChanges(context, message.text);
  if (settlement.kind !== 'answered') throw new Error('the admin reply settled no stored change');
  await answerWithChat(context, message, settlement.confirmedCalls);
}

async function runTurn(run: AdminTextRun, answer: (session: Session) => Promise<void>): Promise<AdminChatTurn> {
  const session = await openSession(run);
  const rowsBefore = await snapshotWorkspace(run.owner, WORKSPACE_A_ID);
  await answer(session);
  assertModelReachedEveryTool(run.model);
  const rowsWritten = listAddedOrChangedRows(rowsBefore, await snapshotWorkspace(run.owner, WORKSPACE_A_ID));
  const passedIds = [...(run.passedIds ?? []), ...run.model.calls.flatMap((call) => collectPassedIds(call.argumentsJson))];
  return { observations: await observeTurn(run, session, rowsWritten), passedIds };
}

async function openSession({ owner, database, model, text }: AdminTextRun): Promise<Session> {
  await queueAdminEvent(owner, text);
  const event = await claimInboundEvent(database, FIXED_NOW);
  if (event === null) throw new Error('the queued admin event was not claimed');
  const sender = await findIntakeSender(database, event, text);
  if (sender === null) throw new Error('the queued admin event has no intake sender');
  const parts = { companyReader: new RecordingReader(), dropOffReader: new RecordingReader(), storage: new FakeFileStorage() };
  const scope = toDatabaseScope(sender);
  const context = buildContext({ database: scopeDatabase(database, scope), model, ...parts }, { event, sender, stages: createStages(database, event, FIXED_CLOCK).forScope(scope) });
  const stored = await runStoreStage(context, { id: ADMIN_MESSAGE_ID, text, imageKey: null, partIndex: 0 });
  return { context, message: { id: stored.id, text }, ...parts };
}

async function queueAdminEvent(owner: PostgresPool, text: string): Promise<void> {
  const payload = JSON.stringify({ text, sent_at: FIXED_NOW.toISOString() });
  await owner.query(
    `INSERT INTO inbound_events (channel, account_id, external_event_id, external_user_id, kind, payload, available_at, received_at)
     VALUES ($1, $2, 'SAFE-A-ATTACK-EVENT', $3, 'text', $4, $5, $5)`,
    [A_ADMIN_SENDER.channel, A_ADMIN_SENDER.accountId, A_ADMIN_SENDER.externalUserId, payload, FIXED_NOW],
  );
}

type ContextParts = { database: Database; model: ScriptedChatModel; companyReader: RecordingReader; dropOffReader: RecordingReader; storage: FakeFileStorage };

function buildContext({ database, model, companyReader, dropOffReader, storage }: ContextParts, claimed: Pick<IntakeContext, 'event' | 'sender' | 'stages'>): IntakeContext {
  const dependencies = { channel: STUB_CHANNEL, clock: FIXED_CLOCK, database, fileStorage: storage, photoStorage: null, reader: companyReader, dropOffReader, chats: { adminChat: model } };
  return { dependencies, reader: companyReader, ...claimed };
}

async function observeTurn({ owner, model }: AdminTextRun, session: Session, rowsWritten: unknown[]): Promise<unknown[]> {
  const { companyReader, dropOffReader } = session;
  return [model.requests, companyReader.requests, dropOffReader.requests, rowsWritten, await listAdminOutboundMessages(owner), ...(await observeStoredFiles(session))];
}
