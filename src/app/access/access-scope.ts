export type AccessScope =
  | { workspaceId: string; userId: string; role: 'member' }
  | { workspaceId: string; userId: string; role: 'admin' };
