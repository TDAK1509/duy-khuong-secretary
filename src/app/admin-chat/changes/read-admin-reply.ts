import { toAccentFreeForm } from '../../reading/normalize.ts';

export type AdminReply = 'yes' | 'no' | 'other';

const YES_REPLIES = new Set(['co', 'ok', 'dong y', 'dung', 'xac nhan']);
const NO_REPLIES = new Set(['khong', 'ko', 'thoi', 'huy']);

export function readAdminReply(text: string | null): AdminReply {
  const plain = toPlainReply(text);
  if (YES_REPLIES.has(plain)) return 'yes';
  return NO_REPLIES.has(plain) ? 'no' : 'other';
}

function toPlainReply(text: string | null): string {
  return (toAccentFreeForm(text) ?? '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}
