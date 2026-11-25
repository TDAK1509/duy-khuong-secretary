import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { runInTransaction, type Database, type Transaction } from '../../db/transaction.ts';
import { setDriverPlateFact } from '../../facts/set-driver-plate-fact.ts';
import { lockWorkspaceRecords } from '../../records/lock-workspace-records.ts';
import { addMemberFactInTransaction, type MemberRef } from '../../memory/member-facts.ts';
import { failTool, MEMBER_NOT_FOUND_ERROR, ToolRefusal } from './tool-result.ts';
import { isVehiclePlate, normalizePlate, refuseInvalidPlate } from './vehicle-plate.ts';

const PLATE_FACT_FULL_ERROR = 'Không thể lưu biển số vì thông tin đã đủ 2000 ký tự.';

const argumentsSchema = z.strictObject({
  member_id: z.string(),
  vehicle_plate: z.string(),
});

const uuidSchema = z.uuid();

const MEMBER_DOCUMENTS_WITH_ANOTHER_PLATE_SQL = `
  WITH member_user AS (SELECT user_id FROM memberships WHERE id = $1 AND workspace_id = $2)
  SELECT id, vehicle_plate FROM documents
  WHERE workspace_id = $2
    AND vehicle_plate IS DISTINCT FROM $3
    AND id IN (
      SELECT document_id FROM document_sources
      WHERE workspace_id = $2
        AND message_id IN (
          SELECT id FROM messages WHERE workspace_id = $2 AND user_id = (SELECT user_id FROM member_user)
        )
    )
`;

const UPDATE_MEMBER_DOCUMENTS_SQL = `
  WITH documents_to_change AS (${MEMBER_DOCUMENTS_WITH_ANOTHER_PLATE_SQL})
  UPDATE documents SET vehicle_plate = $3 WHERE id IN (SELECT id FROM documents_to_change) RETURNING id
`;

export type PlateCount = { plate: string | null; count: number };

export async function runRewriteMemberPlate(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const request = readPlateRequest(parsedArguments, scope.workspaceId);
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, scope.workspaceId);
    const updated = await updateMemberDocumentsInTransaction(transaction, request.ref, request.plate);
    const result = await addMemberFactInTransaction(transaction, request.ref, scope, { fact: `Biển số xe: ${request.plate}`, readers: 'admins_and_member' }, PLATE_FACT_FULL_ERROR);
    if (result === null) return failTool(MEMBER_NOT_FOUND_ERROR);
    await setPlateFactOfMember(transaction, request, scope.userId);
    return JSON.stringify({ ok: true, updated, member: result.displayName, plate: request.plate });
  });
}

export type PlateRequest = { ref: MemberRef; plate: string };

export function readPlateRequest(parsedArguments: unknown, workspaceId: string): PlateRequest {
  const { member_id: memberId, vehicle_plate: rawPlate } = argumentsSchema.parse(parsedArguments);
  const plate = normalizePlate(rawPlate);
  if (!isVehiclePlate(plate)) refuseInvalidPlate(rawPlate);
  if (!uuidSchema.safeParse(memberId).success) throw new ToolRefusal(MEMBER_NOT_FOUND_ERROR);
  return { ref: { workspaceId, membershipId: memberId }, plate };
}

export async function countPapersToRewrite(database: Database, { ref, plate }: PlateRequest): Promise<PlateCount[]> {
  const { rows } = await database.query<{ vehicle_plate: string | null; count: number }>(
    `SELECT vehicle_plate, count(*)::int AS count FROM (${MEMBER_DOCUMENTS_WITH_ANOTHER_PLATE_SQL}) papers
     GROUP BY vehicle_plate ORDER BY count DESC, vehicle_plate`,
    [ref.membershipId, ref.workspaceId, plate],
  );
  return rows.map((row) => ({ plate: row.vehicle_plate, count: row.count }));
}

async function updateMemberDocumentsInTransaction(
  transaction: { query<Row>(statement: string, values?: unknown[]): Promise<Row[]> },
  { workspaceId, membershipId }: MemberRef,
  plate: string,
): Promise<number> {
  const rows = await transaction.query(UPDATE_MEMBER_DOCUMENTS_SQL, [membershipId, workspaceId, plate]);
  return rows.length;
}

async function setPlateFactOfMember(transaction: Transaction, { ref, plate }: PlateRequest, authorUserId: string): Promise<void> {
  const [member] = await transaction.query<{ user_id: string }>('SELECT user_id FROM memberships WHERE id = $1 AND workspace_id = $2', [ref.membershipId, ref.workspaceId]);
  if (member === undefined) return;
  await setDriverPlateFact(transaction, { workspaceId: ref.workspaceId, driverUserId: member.user_id, plate, authorUserId });
}
