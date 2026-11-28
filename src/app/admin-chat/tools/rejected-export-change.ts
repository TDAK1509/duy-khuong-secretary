export class RejectedExportChange extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`the edited export change was rejected: ${reason}`);
    this.name = 'RejectedExportChange';
    this.reason = reason;
  }
}
