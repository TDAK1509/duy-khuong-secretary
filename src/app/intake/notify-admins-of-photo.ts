import { listWorkspaceAdmins, type WorkspaceAdmin } from '../access/list-workspace-admins.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueImage } from '../delivery/enqueue-image.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { IntakeContext } from './intake-context.ts';
import { formatReplyWithReadData, type RepliedPlan } from './format-reply-with-read-data.ts';
import { formatPhotoNotice } from './intake-texts.ts';

type PhotoFacts = { image_key: string; display_name: string; workspace_name: string; sent_at: Date };

export async function notifyAdminsOfPhoto(
  transaction: Transaction,
  context: IntakeContext,
  messageId: string,
  reply: RepliedPlan,
): Promise<void> {
  const { sender } = context;
  if (sender.role !== 'member') return;
  const facts = await findPhotoFacts(transaction, messageId, sender.membershipId, sender.workspaceId);
  if (facts === null) return;
  const notice = formatPhotoNotice({
    senderName: facts.display_name,
    workspaceName: facts.workspace_name,
    sentAt: facts.sent_at,
    replyText: formatReplyWithReadData(reply),
  });
  for (const admin of await listWorkspaceAdmins(transaction, sender.workspaceId)) {
    await enqueueNotice(transaction, context, admin, { text: notice, photoKey: facts.image_key });
  }
}

async function findPhotoFacts(
  transaction: Transaction,
  messageId: string,
  membershipId: string,
  workspaceId: string,
): Promise<PhotoFacts | null> {
  const [facts] = await transaction.query<PhotoFacts>(
    `SELECT message.image_key, membership.display_name, workspace.name AS workspace_name,
       (event.payload ->> 'sent_at')::timestamptz AS sent_at
     FROM messages message
     JOIN inbound_events event ON event.id = message.inbound_event_id, memberships membership, workspaces workspace
     WHERE message.id = $1 AND message.image_key IS NOT NULL AND membership.id = $2 AND workspace.id = $3`,
    [messageId, membershipId, workspaceId],
  );
  return facts ?? null;
}

async function enqueueNotice(
  transaction: Transaction,
  { dependencies }: IntakeContext,
  admin: WorkspaceAdmin,
  { text, photoKey }: { text: string; photoKey: string },
): Promise<void> {
  const delivery = { to: admin.recipient, adminMembershipId: admin.membershipId, requiresOpenWindow: true };
  const availableAt = dependencies.clock.now();
  await enqueueText(transaction, { ...delivery, text, maxTextLength: dependencies.channel.maxTextLength, availableAt });
  await enqueueImage(transaction, { ...delivery, photoKey, availableAt });
}
