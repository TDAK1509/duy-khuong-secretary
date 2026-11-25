import type { IntakeContext } from '../../intake/intake-context.ts';
import { takePendingChanges } from './pending-changes-store.ts';
import { readAdminReply } from './read-admin-reply.ts';
import type { StoredCall } from './stored-call.ts';

export type Settlement = { kind: 'none' } | { kind: 'answered'; confirmedCalls: StoredCall[] };

const NO_SETTLEMENT: Settlement = { kind: 'none' };

export async function settlePendingChanges({ dependencies, sender }: IntakeContext, text: string | null): Promise<Settlement> {
  if (sender.role !== 'admin') return NO_SETTLEMENT;
  const calls = await takePendingChanges(dependencies.database, sender, dependencies.clock.now());
  if (calls.length === 0) return NO_SETTLEMENT;
  const reply = readAdminReply(text);
  if (reply === 'other') return NO_SETTLEMENT;
  return { kind: 'answered', confirmedCalls: reply === 'yes' ? calls : [] };
}
