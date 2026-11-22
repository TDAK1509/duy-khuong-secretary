import type { HeldBackfill } from './backfill-claims.ts';

export class HeldBackfills {
  private readonly backfills = new Map<string, HeldBackfill>();

  add(backfill: HeldBackfill): void {
    this.backfills.set(backfill.backfillId, { backfillId: backfill.backfillId, workspaceId: backfill.workspaceId, token: backfill.token });
  }

  remove(backfillId: string): void {
    this.backfills.delete(backfillId);
  }

  list(): HeldBackfill[] {
    return [...this.backfills.values()];
  }
}
