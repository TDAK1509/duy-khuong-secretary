import type { ClaimedTask } from './claim-due-task.ts';

export type HeldTask = { id: string; claimedLockedUntil: string };

export class HeldTasks {
  private readonly tasks = new Map<string, string>();

  add(task: ClaimedTask): void {
    this.tasks.set(task.id, task.claimedLockedUntil);
  }

  remove(taskId: string): void {
    this.tasks.delete(taskId);
  }

  list(): HeldTask[] {
    return [...this.tasks].map(([id, claimedLockedUntil]) => ({ id, claimedLockedUntil }));
  }
}
