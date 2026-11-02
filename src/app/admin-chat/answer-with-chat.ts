import type { ChatService } from '../../services/chat/chat-service.ts';
import type { AccessScope } from '../access/access-scope.ts';
import type { Transaction } from '../db/transaction.ts';
import { clearPendingChoiceOfSender } from '../identities/clear-pending-choice.ts';
import { enqueueReply, enqueueReplyPhotos } from '../intake/enqueue-reply.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import type { MessageToRead } from '../intake/reply-to-message.ts';
import { clearQuestionPending, setSubmissionStatus, storeBotReply, storeReplyPhotos } from '../intake/store-user-message.ts';
import { ADMIN_TOOLS } from './tools/admin-tools.ts';
import { runToolLoop } from './run-tool-loop.ts';
import { runAdminTool } from './tools/run-admin-tool.ts';
import { buildAdminPrompt } from './admin-prompt.ts';
import { buildUserTurn } from './build-user-turn.ts';
import { loadAdminProfile, type AdminProfile } from './load-admin-profile.ts';
import { loadHistoryTurns } from './load-history-turns.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';
import { PhotoAttachments } from './photo-attachments.ts';
import { DraftProposals, type DraftProposal } from './draft-proposals.ts';
import { loadDraftCard, type DraftCard } from '../schedules/draft-card.ts';

export async function answerWithChat(context: IntakeContext, message: MessageToRead): Promise<void> {
  const profile = await loadAdminProfile(context.dependencies.database, context.sender.membershipId);
  if (profile === null) return;
  const answer = await produceAnswer(context, message, profile);
  await context.stages.runStage({
    isDone: (transaction) => hasAnswer(transaction, message.id),
    write: (transaction) => publishAnswer(transaction, context, message.id, answer),
  });
}

type Answer = { text: string; photos: AttachablePhoto[]; draft: DraftProposal | null };

async function produceAnswer(context: IntakeContext, message: MessageToRead, profile: AdminProfile): Promise<Answer> {
  const { database, clock } = context.dependencies;
  const history = await loadHistoryTurns(database, context.sender, profile.joinedAt, message.id);
  const request = {
    system: buildAdminPrompt({ ...profile, now: clock.now() }),
    turns: [...history, await buildUserTurn(database, message)],
    tools: ADMIN_TOOLS,
  };
  const caller: AccessScope = { workspaceId: context.sender.workspaceId, userId: context.sender.userId, role: 'admin' };
  const dependencies = { database, clock, attachments: new PhotoAttachments(), drafts: new DraftProposals() };
  const text = await runToolLoop(requireChat(context), request, (call) => runAdminTool(dependencies, caller, call));
  return { text, photos: dependencies.attachments.list(), draft: dependencies.drafts.findLatest() };
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
  if (!(await isStillSameAdmin(transaction, sender.membershipId))) return;
  const card = await loadCard(transaction, context, answer);
  if (card !== null) await clearPendingChoiceOfSender(transaction, context.event);
  const text = card === null ? answer.text : `${answer.text}\n\n${card.text}`;
  await storeBotReply(transaction, messageId, { text, kind: 'answer' });
  await storeReplyPhotos(transaction, messageId, answer.photos);
  await clearQuestionPending(transaction, messageId);
  await setSubmissionStatus(transaction, messageId, 'accepted');
  await enqueueReply(transaction, context, text, sender.membershipId, card?.choice);
  await enqueueReplyPhotos(transaction, context, answer.photos, sender.membershipId);
}

async function loadCard(transaction: Transaction, context: IntakeContext, answer: Answer): Promise<DraftCard | null> {
  if (answer.draft === null) return null;
  return loadDraftCard(transaction, answer.draft, context.sender, context.dependencies.clock.now());
}

async function isStillSameAdmin(transaction: Transaction, membershipId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM memberships WHERE id = $1 AND role = 'admin' FOR SHARE`, [membershipId]);
  return rows.length > 0;
}
