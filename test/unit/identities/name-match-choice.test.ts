import { describe, expect, it } from 'vitest';
import { readStoredChoice, toStoredChoice, type PendingChoice } from '../../../src/app/identities/pending-choice.ts';

describe('a stored name match choice', () => {
  const choice: PendingChoice = {
    kind: 'name_match',
    workspaceId: 'w1',
    pairs: [{ matchKey: 'chongloong', organizationId: 'o1', printedName: 'Chống Loong' }],
  };

  it('is stored with the workspace and the match key, organization and printed name of each pair', () => {
    expect(toStoredChoice(choice)).toEqual({
      kind: 'name_match',
      workspace_id: 'w1',
      pairs: [{ match_key: 'chongloong', organization_id: 'o1', printed_name: 'Chống Loong' }],
    });
  });

  it('is read back as the same choice', () => {
    expect(readStoredChoice(toStoredChoice(choice))).toEqual(choice);
  });
});
