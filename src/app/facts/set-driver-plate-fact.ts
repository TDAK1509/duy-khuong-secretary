import type { Transaction } from '../db/transaction.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';

export const PLATE_VALUE_NAME = 'Biển số xe';
const PLATE_VALUE_KEY = 'biensoxe';

const UPDATE_PLATE_VALUES_SQL = `
  UPDATE fact_values value SET text_value = $3, number = NULL, unit = NULL
  FROM facts fact
  WHERE value.fact_id = fact.id AND value.match_key = '${PLATE_VALUE_KEY}'
    AND fact.workspace_id = $1 AND fact.driver_user_id = $2
  RETURNING fact.id
`;

const INSERT_PLATE_FACT_SQL = `
  INSERT INTO facts (workspace_id, author_user_id, statement, driver_user_id) VALUES ($1, $2, $3, $4) RETURNING id
`;

const INSERT_PLATE_VALUE_SQL = `
  INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, text_value) VALUES ($1, $2, 0, '${PLATE_VALUE_NAME}', '${PLATE_VALUE_KEY}', $3)
`;

export type DriverPlate = { workspaceId: string; driverUserId: string; plate: string; authorUserId: string };

export async function setDriverPlateFact(transaction: Transaction, driverPlate: DriverPlate): Promise<void> {
  const updated = await transaction.query<{ id: string }>(UPDATE_PLATE_VALUES_SQL, [driverPlate.workspaceId, driverPlate.driverUserId, driverPlate.plate]);
  if (updated.length > 0) await touchFacts(transaction, updated.map((row) => row.id));
  else await createPlateFact(transaction, driverPlate);
}

async function touchFacts(transaction: Transaction, factIds: string[]): Promise<void> {
  await transaction.query('UPDATE facts SET updated_at = now() WHERE id = ANY($1::uuid[])', [factIds]);
}

async function createPlateFact(transaction: Transaction, { workspaceId, driverUserId, plate, authorUserId }: DriverPlate): Promise<void> {
  const [fact] = await transaction.query<{ id: string }>(INSERT_PLATE_FACT_SQL, [workspaceId, authorUserId, `${PLATE_VALUE_NAME}: ${plate}`, driverUserId]);
  if (fact === undefined) throw new Error('inserting a plate fact returned no row');
  await transaction.query(INSERT_PLATE_VALUE_SQL, [workspaceId, fact.id, plate]);
  await linkFactToMatchingDocuments(transaction, workspaceId, fact.id);
}
