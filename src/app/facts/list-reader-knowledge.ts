import type { Transaction } from '../db/transaction.ts';
import type { ReaderKnowledge } from '../reading/company-knowledge-rule.ts';

type EntryRow = {
  when_goods: string | null;
  when_pickup_name: string | null;
  when_dropoff_name: string | null;
  then_customer: string | null;
  then_dropoff: string | null;
  then_shown_goods_name: string | null;
  then_note: string | null;
};

export async function listReaderKnowledge(transaction: Transaction, workspaceId: string): Promise<ReaderKnowledge[]> {
  return transaction.withScope({ workspaceId }, async () => {
    const rows = await transaction.query<EntryRow>(LIST_READER_ENTRIES_SQL, [workspaceId]);
    return rows.map(toReaderKnowledge);
  });
}

const LIST_READER_ENTRIES_SQL = `
  SELECT when_goods, when_pickup_name, when_dropoff_name, then_customer, then_dropoff, then_shown_goods_name, then_note
  FROM company_knowledge_entries
  WHERE workspace_id = $1
    AND (when_goods IS NOT NULL OR when_pickup_match_key IS NOT NULL OR when_dropoff_match_key IS NOT NULL
      OR (when_vehicle_plate IS NULL AND when_driver_user_id IS NULL))
  ORDER BY created_at, id`;

function toReaderKnowledge(row: EntryRow): ReaderKnowledge {
  return {
    when: keepFilled({ goods: row.when_goods, pickup: row.when_pickup_name, dropoff: row.when_dropoff_name }),
    then: keepFilled({ customer: row.then_customer, dropoff: row.then_dropoff, shown_goods: row.then_shown_goods_name, note: row.then_note }),
  };
}

function keepFilled<Key extends string>(values: Record<Key, string | null>): Partial<Record<Key, string>> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)) as Partial<Record<Key, string>>;
}
