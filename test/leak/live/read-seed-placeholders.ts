import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_DOCUMENT_ID } from '../support/seed-ids.ts';
import type { PlaceholderValues } from './fill-placeholders.ts';

export async function readSeedPlaceholders(owner: PostgresPool): Promise<PlaceholderValues> {
  const { rows } = await owner.query<{ vehicle_plate: string }>('SELECT vehicle_plate FROM documents WHERE id = $1', [A_DOCUMENT_ID]);
  const [document] = rows;
  if (document === undefined) throw new Error('the seed holds no A document to read the shared plate from');
  return { shared_plate: document.vehicle_plate };
}
