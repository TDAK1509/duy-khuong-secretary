import type { ChatRequest, ChatService, ToolSpec } from '../../services/chat/chat-service.ts';
import { isCurrentMember } from '../access/is-current-member.ts';
import type { AccessScope } from '../access/access-scope.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueReply, enqueueReplyPhotos, enqueueSourceCard } from '../intake/enqueue-reply.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import { clearQuestionPending, setSubmissionStatus, storeBotReply, storeReplyPhotos } from '../intake/store-user-message.ts';
import { listChatTools } from './tools/chat-tools.ts';
import { runToolLoop, type LoggedRound, type RunTool, type ToolLoopResult } from './run-tool-loop.ts';
import { formatAdminChatLine } from './format-admin-chat-line.ts';
import { runChatTool } from './tools/run-chat-tool.ts';
import { buildAdminPrompt } from './admin-prompt.ts';
import { buildMemberPrompt } from './member-prompt.ts';
import { buildAbilitySection } from './ability-section.ts';
import { buildUserTurn } from './build-user-turn.ts';
import type { ChatMessage } from './chat-message.ts';
import { hasNoteFromPhoto } from './has-note-from-photo.ts';
import { loadChatProfile, type ChatProfile } from './load-chat-profile.ts';
import { readUserMemory } from '../memory/user-memory.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import { loadHistoryTurns } from './load-history-turns.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';
import { PhotoAttachments } from './photo-attachments.ts';
import { SourceCards, type Conversation, type SourceCard } from './source-cards.ts';
import { CreatedInvites } from './created-invites.ts';
import { NameReviewRequest } from './name-review-request.ts';
import { queueNameProposalToSender } from '../name-matches/queue-name-proposal.ts';
import { CreatedTasks } from './created-tasks.ts';
import { AdminTextGuard } from './tools/admin-text-guard.ts';
import type { AdminToolDependencies } from './tools/tool-dependencies.ts';
import { CHANGE_REFUSED_NOTICE } from './chat-texts.ts';
import { loadTaskSummaries } from '../schedules/load-task-summaries.ts';

export async function answerWithChat(context: IntakeContext, message: ChatMessage): Promise<void> {
  const profile = await loadChatProfile(context.dependencies.database, context.sender.membershipId);
  if (profile === null) return;
  const answer = await produceAnswer(context, message, profile);
  await context.stages.runStage({
    isDone: (transaction) => hasAnswer(transaction, message.id),
    write: (transaction) => publishAnswer(transaction, context, message.id, answer),
  });
}

type Answer = {
  role: ChatProfile['role'];
  text: string;
  photos: AttachablePhoto[];
  createdTaskIds: string[];
  inviteCodes: string[];
  sourceCards: SourceCard[];
  hasNameReview: boolean;
  changeRefused: boolean;
  holdsOtherText: boolean;
};

async function produceAnswer(context: IntakeContext, message: ChatMessage, profile: ChatProfile): Promise<Answer> {
  const hasNote = await hasNoteFromPhoto(context.dependencies.database, message.id);
  const first = await runChatTurn(context, message, profile, { hideFlaggedAnswers: false, hasNote });
  const isRefusedOnlyByHistory = first.answer.changeRefused && first.hasFlaggedAnswer && !hasNote;
  if (!isRefusedOnlyByHistory) return first.answer;
  return (await runChatTurn(context, message, profile, { hideFlaggedAnswers: true, hasNote })).answer;
}

type ChatTurnView = { hideFlaggedAnswers: boolean; hasNote: boolean };

async function runChatTurn(context: IntakeContext, message: ChatMessage, profile: ChatProfile, view: ChatTurnView): Promise<{ answer: Answer; hasFlaggedAnswer: boolean }> {
  const { database, clock } = context.dependencies;
  const { request, hasFlaggedAnswer } = await buildChatRequest(context, message, profile, view.hideFlaggedAnswers);
  const caller: AccessScope = { workspaceId: context.sender.workspaceId, userId: context.sender.userId, role: profile.role };
  const guard = new AdminTextGuard(view.hasNote || (hasFlaggedAnswer && !view.hideFlaggedAnswers));
  const dependencies = { database, clock, attachments: new PhotoAttachments(), sources: new SourceCards(readConversation(context)), created: new CreatedTasks(message.id), invites: new CreatedInvites(), nameReview: new NameReviewRequest(), guard };
  const result = await runLoggedToolLoop(context, message, request, (call) => runChatTool(dependencies, caller, call));
  return { answer: collectAnswer(result.text, profile.role, dependencies), hasFlaggedAnswer };
}

function readConversation({ event }: IntakeContext): Conversation {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}

function collectAnswer(text: string, role: ChatProfile['role'], { attachments, sources, created, invites, nameReview, guard }: AdminToolDependencies): Answer {
  return {
    role,
    text,
    photos: dropQuotedPhotos(attachments.list(), sources.list()),
    createdTaskIds: created.listTaskIds(),
    inviteCodes: invites.listCodes(),
    sourceCards: sources.list(),
    hasNameReview: nameReview.isRequested(),
    changeRefused: guard.hasRefused(),
    holdsOtherText: role === 'member' || guard.hasSeenOtherText(),
  };
}

function dropQuotedPhotos(photos: AttachablePhoto[], cards: SourceCard[]): AttachablePhoto[] {
  const quotedMessageIds = new Set(cards.filter((card) => card.quote !== undefined).map((card) => card.messageId));
  return photos.filter((photo) => !quotedMessageIds.has(photo.sourceMessageId));
}

async function runLoggedToolLoop(context: IntakeContext, message: ChatMessage, request: ChatRequest, runTool: RunTool): Promise<ToolLoopResult> {
  const rounds: LoggedRound[] = [];
  try {
    const result = await runToolLoop(requireChat(context), request, runTool, rounds);
    console.log(formatAdminChatLine(message.id, result.outcome, rounds));
    return result;
  } catch (error) {
    console.log(formatAdminChatLine(message.id, 'chat_failed', rounds));
    throw error;
  }
}

async function buildChatRequest(context: IntakeContext, message: ChatMessage, profile: ChatProfile, hideFlaggedAnswers: boolean): Promise<{ request: ChatRequest; hasFlaggedAnswer: boolean }> {
  const { database, clock } = context.dependencies;
  const history = await loadHistoryTurns(database, context.sender, profile.joinedAt, message.id, hideFlaggedAnswers);
  const tools = listChatTools(profile.role);
  const request = {
    system: buildPrompt(profile, clock.now(), await loadMemory(context), tools),
    turns: [...history.turns, await buildUserTurn(database, message)],
    tools,
  };
  return { request, hasFlaggedAnswer: history.hasFlaggedAnswer };
}

async function loadMemory({ dependencies, sender }: IntakeContext): Promise<string> {
  const ownerScope = { workspaceId: sender.workspaceId, ownerUserId: sender.userId };
  return readUserMemory(scopeDatabase(dependencies.database, ownerScope), sender);
}

function buildPrompt(profile: ChatProfile, now: Date, memory: string, tools: ToolSpec[]): string {
  const build = profile.role === 'admin' ? buildAdminPrompt : buildMemberPrompt;
  return [build({ ...profile, now, memory }), buildAbilitySection(tools)].join('\n\n');
}

function requireChat(context: IntakeContext): ChatService {
  const { chat } = context.dependencies;
  if (chat === null) throw new Error('the chat service is not configured');
  return chat;
}

async function hasAnswer(transaction: Transaction, messageId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM messages WHERE reply_to = $1 AND reply_kind = 'answer'`, [messageId]);
  return rows.length > 0;
}

async function publishAnswer(transaction: Transaction, context: IntakeContext, messageId: string, answer: Answer): Promise<void> {
  const { sender } = context;
  if (!(await isCurrentMember(transaction, sender.membershipId, answer.role))) return;
  const summaries = await loadTaskSummaries(transaction, answer.createdTaskIds, sender);
  const text = joinAnswerParts(answer, summaries);
  await storeBotReply(transaction, messageId, { text: [text, ...answer.sourceCards.map((card) => card.text)].join('\n\n'), kind: 'answer', holdsOtherText: answer.holdsOtherText });
  await storeReplyPhotos(transaction, messageId, answer.photos);
  await clearQuestionPending(transaction, messageId);
  await setSubmissionStatus(transaction, messageId, 'accepted');
  await enqueueAnswerMessages(transaction, context, answer, text);
  if (answer.hasNameReview) await queueNameProposalToSender(transaction, context);
}

async function enqueueAnswerMessages(transaction: Transaction, context: IntakeContext, answer: Answer, text: string): Promise<void> {
  const adminMembershipId = answer.role === 'admin' ? context.sender.membershipId : undefined;
  await enqueueReply(transaction, context, text, { adminMembershipId });
  for (const inviteCode of answer.inviteCodes) await enqueueReply(transaction, context, inviteCode, { adminMembershipId });
  for (const card of answer.sourceCards) await enqueueSourceCard(transaction, context, card, adminMembershipId);
  await enqueueReplyPhotos(transaction, context, answer.photos, adminMembershipId);
}

function joinAnswerParts(answer: Answer, summaries: string[]): string {
  const notice = answer.changeRefused ? [CHANGE_REFUSED_NOTICE] : [];
  return [answer.text, ...summaries, ...notice].join('\n\n');
}
