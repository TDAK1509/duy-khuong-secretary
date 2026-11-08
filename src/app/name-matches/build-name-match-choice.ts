import type { PendingChoice } from '../identities/pending-choice.ts';
import type { NameProposal } from './build-name-proposal.ts';

export function buildNameMatchChoice(workspaceId: string, proposal: NameProposal): PendingChoice {
  const pairs = proposal.listed.map(({ matchKey, organizationId, printedName }) => ({ matchKey, organizationId, printedName }));
  return { kind: 'name_match', workspaceId, pairs };
}
