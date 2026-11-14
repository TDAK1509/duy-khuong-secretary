import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Database } from '../../db/transaction.ts';
import { addMemberFact, type MemberRef } from '../../memory/member-facts.ts';
import { failTool, MEMBER_NOT_FOUND_ERROR, refuseInvalidArgument } from './tool-result.ts';

const PLATE_FACT_FULL_ERROR = 'Không thể lưu biển số vì thông tin đã đủ 2000 ký tự.';
const PLATE_REGEX = /^\d{2}[A-Z]\d{3,5}$/;

const argumentsSchema = z.strictObject({
  member_id: z.string(),
  vehicle_plate: z.string(),
});

const uuidSchema = z.uuid();

const UPDATE_MEMBER_DOCUMENTS_SQL = `
  WITH member_user AS (SELECT user_id FROM memberships WHERE id = $1 AND workspace_id = $2)
  UPDATE documents
  SET vehicle_plate = $3
  WHERE workspace_id = $2
    AND vehicle_plate IS DISTINCT FROM $3
    AND id IN (
      SELECT document_id FROM document_sources
      WHERE workspace_id = $2
        AND message_id IN (
          SELECT id FROM messages WHERE workspace_id = $2 AND user_id = (SELECT user_id FROM member_user)
        )
    )
  RETURNING id
`;

export async function runRewriteMemberPlate(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { member_id: memberId, vehicle_plate: rawPlate } = argumentsSchema.parse(parsedArguments);
  const plate = normalizePlate(rawPlate);
  if (!PLATE_REGEX.test(plate)) refuseInvalidArgument('vehicle_plate');
  if (!uuidSchema.safeParse(memberId).success) return failTool(MEMBER_NOT_FOUND_ERROR);
  const ref: MemberRef = { workspaceId: scope.workspaceId, membershipId: memberId };
  const displayName = await resolveDisplayName(database, ref);
  if (displayName === null) return failTool(MEMBER_NOT_FOUND_ERROR);
  const updated = await updateMemberDocuments(database, ref, plate);
  await addMemberFact(database, ref, scope, { fact: `Biển số xe: ${plate}`, readers: 'admins_and_member' }, PLATE_FACT_FULL_ERROR);
  return JSON.stringify({ ok: true, updated, member: displayName, plate });
}

async function resolveDisplayName(database: Database, { workspaceId, membershipId }: MemberRef): Promise<string | null> {
  const { rows } = await database.query<{ display_name: string }>(
    'SELECT display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [membershipId, workspaceId],
  );
  return rows[0] ? rows[0].display_name : null;
}

async function updateMemberDocuments(database: Database, { workspaceId, membershipId }: MemberRef, plate: string): Promise<number> {
  return runInTransaction(database, async (transaction) => {
    const rows = await transaction.query(UPDATE_MEMBER_DOCUMENTS_SQL, [membershipId, workspaceId, plate]);
    return rows.length;
  });
}

function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}
