import type { Transaction } from '../db/transaction.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import { formatSavedReply } from '../records/format-saved-reply.ts';
import { formatMissingDetails } from './format-missing-details.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { ReplyPlan } from './plan-reply.ts';

export type TaggedDriver = { userId: string; name: string };

export type DriverTag = { kind: 'tagged'; driver: TaggedDriver } | { kind: 'not_found' | 'ambiguous'; name: string };

export async function findDriverTag(transaction: Transaction, sender: IntakeSender, plan: ReplyPlan): Promise<DriverTag | null> {
  const name = plan.namedDriver?.trim() ?? '';
  if (sender.role !== 'admin' || plan.saved === null || name === '') return null;
  const wanted = toAccentFreeForm(name);
  const members = await transaction.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE workspace_id = $1',
    [sender.workspaceId],
  );
  const matches = members.filter((member) => toAccentFreeForm(member.display_name) === wanted);
  const [only] = matches;
  if (matches.length > 1) return { kind: 'ambiguous', name };
  return only === undefined ? { kind: 'not_found', name } : { kind: 'tagged', driver: { userId: only.user_id, name: only.display_name } };
}

export function nameDriverInReply(plan: ReplyPlan, tag: DriverTag | null): ReplyPlan {
  if (tag === null || plan.saved === null) return plan;
  if (tag.kind === 'tagged') return { ...plan, replyText: formatSavedReply(plan.saved, tag.driver.name) + formatMissingDetails(plan.readItems) };
  return { ...plan, replyText: `${plan.replyText}\n${describeUntaggedDriver(tag)}` };
}

function describeUntaggedDriver({ kind, name }: { kind: 'not_found' | 'ambiguous'; name: string }): string {
  if (kind === 'ambiguous') return `Có nhiều người tên "${name}" trong nhóm, nên giấy tờ được lưu mà không gắn tài xế.`;
  return `Không tìm thấy tài xế tên "${name}" trong nhóm, nên giấy tờ được lưu mà không gắn tài xế.`;
}

export function readTaggedDriver(tag: DriverTag | null): TaggedDriver | null {
  return tag?.kind === 'tagged' ? tag.driver : null;
}
