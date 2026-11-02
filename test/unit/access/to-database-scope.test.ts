import { describe, expect, it } from 'vitest';
import { toDatabaseScope } from '../../../src/app/access/to-database-scope.ts';

describe('toDatabaseScope', () => {
  it('limits a member to the own records of the workspace', () => {
    const scope = toDatabaseScope({ workspaceId: 'w', userId: 'u', role: 'member' });

    expect(scope).toEqual({ workspaceId: 'w', ownerUserId: 'u' });
  });

  it('gives an admin the whole workspace', () => {
    const scope = toDatabaseScope({ workspaceId: 'w', userId: 'u', role: 'admin' });

    expect(scope).toEqual({ workspaceId: 'w' });
  });
});
