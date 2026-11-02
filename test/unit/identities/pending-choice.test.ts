import { describe, expect, it } from 'vitest';
import { readStoredChoice } from '../../../src/app/identities/pending-choice.ts';

describe('readStoredChoice', () => {
  it('reads an old stored draft confirmation as no choice', () => {
    const stored = { kind: 'draft_confirm', task_id: 't', workspace_id: 'w' };

    expect(readStoredChoice(stored)).toBeNull();
  });

  it('reads a stored workspace pick', () => {
    const stored = { kind: 'workspace_pick', workspace_ids: ['w1', 'w2'] };

    expect(readStoredChoice(stored)).toEqual({ kind: 'workspace_pick', workspaceIds: ['w1', 'w2'] });
  });

  it('reads nothing stored as no choice', () => {
    expect(readStoredChoice(null)).toBeNull();
  });
});
