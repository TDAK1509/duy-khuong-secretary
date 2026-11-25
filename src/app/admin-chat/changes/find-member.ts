import { z } from 'zod';
import type { Database } from '../../db/transaction.ts';
import { MEMBER_NOT_FOUND_ERROR, ToolRefusal } from '../tools/tool-result.ts';

export type FoundMember = { userId: string; displayName: string };

const uuidSchema = z.uuid();

export async function findMember(database: Database, workspaceId: string, membershipId: string): Promise<FoundMember> {
  if (!uuidSchema.safeParse(membershipId).success) throw new ToolRefusal(MEMBER_NOT_FOUND_ERROR);
  const { rows } = await database.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [membershipId, workspaceId],
  );
  const [row] = rows;
  if (row === undefined) throw new ToolRefusal(MEMBER_NOT_FOUND_ERROR);
  return { userId: row.user_id, displayName: row.display_name };
}
