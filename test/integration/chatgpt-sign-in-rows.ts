import { timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type SignInRowsToInsert = { count: number; expiresAt: Date };

export async function insertSignIns(database: TemporaryDatabase, { count, expiresAt }: SignInRowsToInsert): Promise<void> {
  await database.query(
    `INSERT INTO chatgpt_sign_ins (browser_key_hash, client_id, redirect_uri, code_challenge, expires_at)
     SELECT 'key-' || number, 'client', 'redirect', 'challenge', ${timestamp(expiresAt)}
     FROM generate_series(1, ${count}) AS number`,
  );
}
