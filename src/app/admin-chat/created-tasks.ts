export class CreatedTasks {
  private readonly sourceMessageId: string | null;
  private readonly taskIds: string[] = [];
  private createCallCount = 0;

  constructor(sourceMessageId: string | null) {
    this.sourceMessageId = sourceMessageId;
  }

  takeNextCreationKey(): string | null {
    if (this.sourceMessageId === null) return null;
    this.createCallCount += 1;
    return `${this.sourceMessageId}:${this.createCallCount}`;
  }

  record(taskId: string): void {
    this.taskIds.push(taskId);
  }

  listTaskIds(): string[] {
    return [...this.taskIds];
  }
}
