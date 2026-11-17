import { z } from 'zod';
import type { Database } from '../../db/transaction.ts';
import { MEMBER_NOT_FOUND_ERROR, ToolRefusal } from './tool-result.ts';

export type FactDriver = { userId: string; name: string };

export async function findFactDriver(database: Database, workspaceId: string, memberId: string | null): Promise<FactDriver | null> {
  if (memberId === null) return null;
  if (!z.uuid().safeParse(memberId).success) throw new ToolRefusal(MEMBER_NOT_FOUND_ERROR);
  const { rows } = await database.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [memberId, workspaceId],
  );
  const [row] = rows;
  if (row === undefined) throw new ToolRefusal(MEMBER_NOT_FOUND_ERROR);
  return { userId: row.user_id, name: row.display_name };
}
