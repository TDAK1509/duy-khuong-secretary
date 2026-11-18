import type { ClaimedEvent } from './claimed-event.ts';

export type HeldEvent = { id: string; claimToken: string };

export class HeldEvents {
  private readonly events = new Map<string, string>();

  add(event: ClaimedEvent): void {
    this.events.set(event.id, event.claimToken);
  }

  remove(eventId: string): void {
    this.events.delete(eventId);
  }

  list(): HeldEvent[] {
    return [...this.events].map(([id, claimToken]) => ({ id, claimToken }));
  }
}
