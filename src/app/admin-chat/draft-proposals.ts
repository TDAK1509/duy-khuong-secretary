export type DraftProposal = { taskId: string; replacedTitle: string | null };

export class DraftProposals {
  private latestProposal: DraftProposal | null = null;

  record(proposal: DraftProposal): void {
    this.latestProposal = proposal;
  }

  findLatest(): DraftProposal | null {
    return this.latestProposal;
  }
}
