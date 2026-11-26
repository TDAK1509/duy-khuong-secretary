import { isGuardedTool } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';
import type { StoredCall } from '../../../src/app/admin-chat/changes/stored-call.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { listAttackArguments, type AttackCase } from './attack-case.ts';
import { CHANGE_ATTACK_CASES } from './change-attack-cases.ts';
import { ATTACK_TEXT } from './attack-text.ts';
import { A_ADMIN_MEMBERSHIP_ID, A_PENDING_CHANGES_ID, A_SCHEDULED_TASK_ID } from './seed-chat-ids.ts';
import { FIXED_NOW } from './seed-ids.ts';

const BEFORE_SEEDED_HISTORY = '2026-01-01T00:00:00Z';

export async function markAdminAsJoinedBeforeHistory(owner: PostgresPool): Promise<void> {
  await owner.query('UPDATE memberships SET created_at = $2 WHERE id = $1', [A_ADMIN_MEMBERSHIP_ID, BEFORE_SEEDED_HISTORY]);
}

export async function storeAttackAsDueTaskInstruction(owner: PostgresPool): Promise<void> {
  await owner.query('UPDATE scheduled_tasks SET instruction = $2 WHERE id = $1', [A_SCHEDULED_TASK_ID, ATTACK_TEXT]);
}

export async function storeGuardedChangesAimedAtB(owner: PostgresPool): Promise<StoredCall[]> {
  const calls = CHANGE_ATTACK_CASES.flatMap(listStoredCalls);
  await owner.query('UPDATE pending_changes SET calls = $2::jsonb, created_at = $3 WHERE id = $1', [A_PENDING_CHANGES_ID, JSON.stringify(calls), FIXED_NOW]);
  return calls;
}

function listStoredCalls({ name, ...attackCase }: AttackCase): StoredCall[] {
  if (!isGuardedTool(name)) return [];
  return listAttackArguments({ name, ...attackCase }).map((toolArguments) => ({ name, arguments: toolArguments }));
}
