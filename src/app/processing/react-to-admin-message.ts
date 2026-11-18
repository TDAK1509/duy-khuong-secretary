import { readAccessKey } from '../channel-auth/read-access-key.ts';
import { findIntakeSender } from '../intake/find-intake-sender.ts';
import type { ClaimedEvent } from './claimed-event.ts';
import type { InboundHandlerDependencies } from './handle-inbound-event.ts';

export async function reactToAdminMessage(dependencies: InboundHandlerDependencies, event: ClaimedEvent, text: string | null): Promise<void> {
  if (event.attempts !== 1) return;
  try {
    await reactIfAdmin(dependencies, event, text);
  } catch (error) {
    console.error(`[reaction] failed event=${event.id} reason=${error instanceof Error ? error.name : 'unknown'}`);
  }
}

async function reactIfAdmin({ channel, database, encryptionKey }: InboundHandlerDependencies, event: ClaimedEvent, text: string | null): Promise<void> {
  const sender = await findIntakeSender(database, event, text);
  if (sender?.role !== 'admin') return;
  const accessKey = await readAccessKey(database, event.channel, event.accountId, encryptionKey);
  if (accessKey === null) return console.error(`[reaction] failed event=${event.id} reason=no_access_key`);
  const recipient = { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
  const result = await channel.reactWithThumbsUp(recipient, event.externalEventId, accessKey);
  if (result.ok) return console.log(`[reaction] sent event=${event.id}`);
  console.error(`[reaction] failed event=${event.id} reason=${result.reason}`);
}
