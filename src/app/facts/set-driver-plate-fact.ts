import type { Transaction } from '../db/transaction.ts';
import { linkEntryToMatchingDocuments } from './link-facts.ts';

const PLATE_NOTE_LABEL = 'Biển số xe';

const NOTE_OF_DRIVER_ONLY_ENTRIES_SQL = `
  SELECT entry.id FROM company_knowledge_entries entry
  WHERE entry.workspace_id = $1 AND entry.when_driver_user_id = $2
    AND entry.when_goods IS NULL AND entry.when_vehicle_plate IS NULL AND entry.when_pickup_match_key IS NULL AND entry.when_dropoff_match_key IS NULL
    AND entry.then_note ~ '(^|\n)${PLATE_NOTE_LABEL}: '
`;

const PLATE_PATTERN = `'\\d{2}[A-Z]-?\\d{3,4}\\.?\\d{2}'`;

const RESTATE_PLATE_SQL = `
  UPDATE company_knowledge_entries
  SET then_note = CASE WHEN then_note ~ ${PLATE_PATTERN} THEN regexp_replace(then_note, ${PLATE_PATTERN}, $2, 'g') ELSE $3 END,
      statement = CASE
        WHEN statement ~ ${PLATE_PATTERN} THEN regexp_replace(statement, ${PLATE_PATTERN}, $2, 'g')
        ELSE statement || E'\\n' || $3
      END,
      updated_at = now()
  WHERE id = ANY($1::uuid[])
`;

const INSERT_PLATE_ENTRY_SQL = `
  INSERT INTO company_knowledge_entries (workspace_id, author_user_id, statement, when_driver_user_id, then_note) VALUES ($1, $2, $3, $4, $3) RETURNING id
`;

export type DriverPlate = { workspaceId: string; driverUserId: string; plate: string; authorUserId: string };

export async function setDriverPlateFact(transaction: Transaction, driverPlate: DriverPlate): Promise<void> {
  const found = await transaction.query<{ id: string }>(NOTE_OF_DRIVER_ONLY_ENTRIES_SQL, [driverPlate.workspaceId, driverPlate.driverUserId]);
  if (found.length > 0) await restateEntries(transaction, found.map((row) => row.id), driverPlate.plate);
  else await createPlateEntry(transaction, driverPlate);
}

async function restateEntries(transaction: Transaction, entryIds: string[], plate: string): Promise<void> {
  await transaction.query(RESTATE_PLATE_SQL, [entryIds, plate, describePlate(plate)]);
}

function describePlate(plate: string): string {
  return `${PLATE_NOTE_LABEL}: ${plate}`;
}

async function createPlateEntry(transaction: Transaction, { workspaceId, driverUserId, plate, authorUserId }: DriverPlate): Promise<void> {
  const [entry] = await transaction.query<{ id: string }>(INSERT_PLATE_ENTRY_SQL, [workspaceId, authorUserId, describePlate(plate), driverUserId]);
  if (entry === undefined) throw new Error('inserting a plate entry returned no row');
  await linkEntryToMatchingDocuments(transaction, workspaceId, entry.id);
}
