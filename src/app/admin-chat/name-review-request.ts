export class NameReviewRequest {
  private requested = false;

  request(): void {
    this.requested = true;
  }

  isRequested(): boolean {
    return this.requested;
  }
}
