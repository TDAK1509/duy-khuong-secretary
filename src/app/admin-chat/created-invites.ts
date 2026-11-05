export class CreatedInvites {
  private readonly codes: string[] = [];

  record(code: string): void {
    this.codes.push(code);
  }

  listCodes(): string[] {
    return [...this.codes];
  }
}
