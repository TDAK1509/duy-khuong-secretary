import type { ChatRequest, ChatService, ToolSpec } from '../../services/chat/chat-service.ts';
import { isCurrentMember } from '../access/is-current-member.ts';
import type { AccessScope } from '../access/access-scope.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueReply, enqueueReplyPhotos, enqueueSourceCard } from '../intake/enqueue-reply.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import { clearQuestionPending, setSubmissionStatus, storeBotReply, storeReplyPhotos } from '../intake/store-user-message.ts';
import { listChatTools } from './tools/chat-tools.ts';
import { ADMIN_TOOL_ROUNDS, runToolLoop, type LoggedRound, type RunTool, type ToolLoopOutcome, type ToolLoopResult } from './run-tool-loop.ts';
import { formatAdminChatLine } from './format-admin-chat-line.ts';
import { runChatTool } from './tools/run-chat-tool.ts';
import { buildAdminPrompt } from './admin-prompt.ts';
import { buildAbilitySection } from './ability-section.ts';
import { buildChatContextTurn } from './build-chat-context.ts';
import { buildCurrentRequest } from './build-user-turn.ts';
import type { ChatMessage } from './chat-message.ts';
import { hasNoteFromPhoto } from './has-note-from-photo.ts';
import { loadChatProfile, type ChatProfile } from './load-chat-profile.ts';
import { readPrivateMemory } from '../memory/private-memory.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import { listTypedTexts, loadHistoryTurns } from './load-history-turns.ts';
import { loadCompanyRules } from './load-company-rules.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';
import { PhotoAttachments } from './photo-attachments.ts';
import { SourceCards, type Conversation, type SourceCard } from './source-cards.ts';
import { CreatedInvites } from './created-invites.ts';
import { CreatedTasks } from './created-tasks.ts';
import { AdminTextGuard } from './tools/admin-text-guard.ts';
import type { AdminToolDependencies } from './tools/tool-dependencies.ts';
import { replacePendingChanges } from './changes/pending-changes-store.ts';
import { runConfirmedCalls, type ConfirmedChange } from './changes/run-confirmed-calls.ts';
import type { StoredCall } from './changes/stored-call.ts';
import { buildConfirmationQuestion, WaitingChanges, type WaitingChange } from './changes/waiting-changes.ts';
import { loadTaskSummaries } from '../schedules/load-task-summaries.ts';
import { claimDocumentSetupOffer, listOfferMadeProfileLines } from './document-setup-offer.ts';
import { DOCUMENT_SETUP_OFFER_TEXT } from '../processing/conversation-texts.ts';

export async function answerWithChat(context: IntakeContext, message: ChatMessage, confirmedCalls: StoredCall[] = []): Promise<void> {
  const profile = await loadChatProfile(context.dependencies.database, context.sender.membershipId);
  if (profile === null || profile.role !== 'admin') return;
  const answer = await produceAnswer(context, message, profile, confirmedCalls);
  await context.stages.runStage({
    isDone: (transaction) => hasAnswer(transaction, message.id),
    write: (transaction) => publishAnswer(transaction, context, message.id, answer),
  });
}

type Answer = {
  outcome: ToolLoopOutcome;
  text: string;
  photos: AttachablePhoto[];
  createdTaskIds: string[];
  inviteCodes: string[];
  sourceCards: SourceCard[];
  waitingChanges: WaitingChange[];
};

async function produceAnswer(context: IntakeContext, message: ChatMessage, profile: ChatProfile, confirmedCalls: StoredCall[]): Promise<Answer> {
  const hasNote = await hasNoteFromPhoto(context.dependencies.database, message.id);
  const caller: AccessScope = { workspaceId: context.sender.workspaceId, userId: context.sender.userId, role: 'admin' };
  const dependencies = buildToolDependencies(context, message, new AdminTextGuard(hasNote));
  const confirmed = await runConfirmedCalls(dependencies, caller, confirmedCalls);
  const { request, typedHistoryTexts } = await buildChatRequest(context, message, profile, confirmed);
  const toolDependencies = { ...dependencies, typedHistoryTexts };
  const result = await runLoggedToolLoop(findAdminChat(context), message, request, (call) => runChatTool(toolDependencies, caller, call));
  return collectAnswer(result, toolDependencies);
}

function buildToolDependencies(context: IntakeContext, message: ChatMessage, guard: AdminTextGuard): AdminToolDependencies {
  const { database, clock, fileStorage, dropOffReader } = context.dependencies;
  return { database, clock, fileStorage, companyReader: context.reader, dropOffReader, currentMessageText: message.text, currentMessageId: message.id, attachments: new PhotoAttachments(), sources: new SourceCards(readConversation(context)), created: new CreatedTasks(message.id), invites: new CreatedInvites(), guard, waiting: new WaitingChanges() };
}

function readConversation({ event }: IntakeContext): Conversation {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}

function collectAnswer({ outcome, text }: ToolLoopResult, { attachments, sources, created, invites, waiting }: AdminToolDependencies): Answer {
  return {
    outcome,
    text,
    photos: dropDeliveredPhotos(attachments.list(), sources.list()),
    createdTaskIds: created.listTaskIds(),
    inviteCodes: invites.listCodes(),
    sourceCards: sources.list(),
    waitingChanges: waiting.list(),
  };
}

function dropDeliveredPhotos(photos: AttachablePhoto[], cards: SourceCard[]): AttachablePhoto[] {
  const deliveredMessageIds = new Set(cards.filter(hasPhotoDelivery).map((card) => card.messageId));
  return photos.filter((photo) => !deliveredMessageIds.has(photo.sourceMessageId));
}

function hasPhotoDelivery(card: SourceCard): boolean {
  return card.quote !== undefined || card.albumPhotoKey !== undefined;
}

async function runLoggedToolLoop(chat: ChatService, message: ChatMessage, request: ChatRequest, runTool: RunTool): Promise<ToolLoopResult> {
  const rounds: LoggedRound[] = [];
  try {
    const result = await runToolLoop(chat, request, runTool, rounds, ADMIN_TOOL_ROUNDS);
    console.log(formatAdminChatLine(message.id, result.outcome, rounds));
    return result;
  } catch (error) {
    console.log(formatAdminChatLine(message.id, 'chat_failed', rounds));
    throw error;
  }
}

type BuiltRequest = { request: ChatRequest; typedHistoryTexts: string[] };

async function buildChatRequest(context: IntakeContext, message: ChatMessage, profile: ChatProfile, confirmed: ConfirmedChange[]): Promise<BuiltRequest> {
  const { database, clock } = context.dependencies;
  const history = await loadHistoryTurns(database, context.sender, profile.joinedAt, message.id);
  const tools = listChatTools('admin');
  const current = await buildCurrentRequest(database, message, context.sender.workspaceId);
  const profileLines = await buildProfileLines(context, profile);
  const rules = await loadCompanyRules(context);
  const contextTurn = buildChatContextTurn({ profileLines, memory: await loadMemory(context), rules, history, confirmed, current });
  const request = { system: buildPrompt(clock.now(), tools), turns: [contextTurn], tools };
  return { request, typedHistoryTexts: listTypedTexts(history) };
}

async function buildProfileLines({ dependencies, sender }: IntakeContext, profile: ChatProfile): Promise<string[]> {
  const offerLines = await listOfferMadeProfileLines(dependencies.database, sender.workspaceId, profile.documentSetupOfferedAt, dependencies.clock.now());
  return [`Nhóm: ${profile.workspaceName}`, `Người đang trò chuyện: ${profile.displayName}`, ...offerLines];
}

async function loadMemory({ dependencies, sender }: IntakeContext): Promise<string> {
  const ownerScope = { workspaceId: sender.workspaceId, ownerUserId: sender.userId };
  return readPrivateMemory(scopeDatabase(dependencies.database, ownerScope), sender);
}

function buildPrompt(now: Date, tools: ToolSpec[]): string {
  return [buildAdminPrompt({ now }), buildAbilitySection(tools)].join('\n\n');
}

function findAdminChat(context: IntakeContext): ChatService {
  const { chats } = context.dependencies;
  if (chats === null) throw new Error('the chat service is not configured');
  return chats.adminChat;
}

async function hasAnswer(transaction: Transaction, messageId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM messages WHERE reply_to = $1 AND reply_kind = 'answer'`, [messageId]);
  return rows.length > 0;
}

async function publishAnswer(transaction: Transaction, context: IntakeContext, messageId: string, answer: Answer): Promise<void> {
  const { sender } = context;
  if (!(await isCurrentMember(transaction, sender.membershipId, 'admin'))) return;
  const summaries = await loadTaskSummaries(transaction, answer.createdTaskIds, sender);
  await storeWaitingChanges(transaction, context, answer);
  const offer = await offerDocumentSetup(transaction, context, answer);
  const text = joinAnswerParts(answer, summaries, offer);
  await storeBotReply(transaction, messageId, { text: [text, ...answer.sourceCards.map((card) => card.text)].join('\n\n'), kind: 'answer' });
  await storeReplyPhotos(transaction, messageId, answer.photos);
  await clearQuestionPending(transaction, messageId);
  await setSubmissionStatus(transaction, messageId, 'accepted');
  await enqueueAnswerMessages(transaction, context, answer, text);
}

async function offerDocumentSetup(transaction: Transaction, { sender, dependencies }: IntakeContext, answer: Answer): Promise<string[]> {
  if (!isRealAnswer(answer)) return [];
  return (await claimDocumentSetupOffer(transaction, sender, dependencies.clock.now())) ? [DOCUMENT_SETUP_OFFER_TEXT] : [];
}

async function storeWaitingChanges(transaction: Transaction, { sender, dependencies }: IntakeContext, { waitingChanges }: Answer): Promise<void> {
  if (waitingChanges.length === 0) return;
  await replacePendingChanges(transaction, sender, waitingChanges.map(({ call }) => call), dependencies.clock.now());
}

function isRealAnswer({ outcome, text, waitingChanges }: Answer): boolean {
  return outcome === 'answered' && text.trim() !== '' && waitingChanges.length === 0;
}

async function enqueueAnswerMessages(transaction: Transaction, context: IntakeContext, answer: Answer, text: string): Promise<void> {
  const adminMembershipId = context.sender.membershipId;
  await enqueueReply(transaction, context, text, { adminMembershipId });
  for (const inviteCode of answer.inviteCodes) await enqueueReply(transaction, context, inviteCode, { adminMembershipId });
  for (const card of answer.sourceCards) await enqueueSourceCard(transaction, context, card, adminMembershipId);
  await enqueueReplyPhotos(transaction, context, answer.photos, adminMembershipId);
}

function joinAnswerParts(answer: Answer, summaries: string[], offer: string[]): string {
  const question = answer.waitingChanges.length > 0 ? [buildConfirmationQuestion(answer.waitingChanges)] : [];
  return [answer.text, ...summaries, ...question, ...offer].join('\n\n');
}
