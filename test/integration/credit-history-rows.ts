import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertWorkspace } from './workspace-rows.ts';

export type NewAddition = {
  workspaceId: string;
  credits: number;
  balanceAfter: number;
  source?: 'starting_grant' | 'internal_user';
  addedBy?: string;
  note?: string;
  createdAt?: Date;
};

export async function insertAddition(database: TemporaryDatabase, addition: NewAddition): Promise<void> {
  await database.query(
    `INSERT INTO credit_additions (workspace_id, credits, source, added_by, note, balance_after, created_at)
     VALUES (${literal(addition.workspaceId)}, ${addition.credits}, ${literal(addition.source ?? 'starting_grant')},
       ${addition.addedBy ? literal(addition.addedBy) : 'NULL'}, ${literal(addition.note ?? 'Credit ban đầu')}, ${addition.balanceAfter},
       ${timestamp(addition.createdAt ?? new Date('2026-10-01T10:00:00+07:00'))})`,
  );
}

export type NewCall = {
  workspaceId: string;
  createdAt: Date;
  kind?: string;
  credits?: number;
  costUsd?: number;
  balanceAfter?: number | null;
};

export async function insertCall(database: TemporaryDatabase, call: NewCall): Promise<void> {
  await database.query(
    `INSERT INTO llm_calls (workspace_id, kind, model, cost_usd, credits, balance_after, created_at)
     VALUES (${literal(call.workspaceId)}, ${literal(call.kind ?? 'photo_read')}, 'gpt-6.1-sol', ${call.costUsd ?? 0.0264}, ${call.credits ?? 39.6},
       ${call.balanceAfter ?? 'NULL'}, ${timestamp(call.createdAt)})`,
  );
  await database.query(`UPDATE workspaces SET credit_balance = credit_balance - ${call.credits ?? 39.6} WHERE id = ${literal(call.workspaceId)}`);
}

export async function insertWorkspaceWithCredits(database: TemporaryDatabase, name: string, credits: number): Promise<string> {
  const workspaceId = await insertWorkspace(database, name);
  await insertAddition(database, { workspaceId, credits, balanceAfter: credits });
  await database.query(`UPDATE workspaces SET credit_balance = ${credits} WHERE id = ${literal(workspaceId)}`);
  return workspaceId;
}
