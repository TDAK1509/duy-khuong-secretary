import type { HeldFile } from './file-claims.ts';

export class HeldFiles {
  private readonly files = new Map<string, HeldFile>();

  add(file: HeldFile): void {
    this.files.set(file.fileId, { fileId: file.fileId, workspaceId: file.workspaceId, step: file.step, token: file.token });
  }

  remove(fileId: string): void {
    this.files.delete(fileId);
  }

  list(): HeldFile[] {
    return [...this.files.values()];
  }
}
