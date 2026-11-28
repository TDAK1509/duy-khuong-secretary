import type { Transaction } from '../db/transaction.ts';
import type { ReaderKnowledge } from '../reading/company-knowledge-rule.ts';

type EntryRow = {
  when_goods: string | null;
  when_pickup_name: string | null;
  when_dropoff_name: string | null;
  then_customer: string | null;
  then_dropoff: string | null;
  then_note: string | null;
};

export async function listReaderKnowledge(transaction: Transaction, workspaceId: string): Promise<ReaderKnowledge[]> {
  return transaction.withScope({ workspaceId }, async () => {
    const rows = await transaction.query<EntryRow>(
      `SELECT when_goods, when_pickup_name, when_dropoff_name, then_customer, then_dropoff, then_note
       FROM company_knowledge_entries WHERE workspace_id = $1 ORDER BY created_at, id`,
      [workspaceId],
    );
    return rows.map(toReaderKnowledge);
  });
}

function toReaderKnowledge(row: EntryRow): ReaderKnowledge {
  return {
    when: keepFilled({ goods: row.when_goods, pickup: row.when_pickup_name, dropoff: row.when_dropoff_name }),
    then: keepFilled({ customer: row.then_customer, dropoff: row.then_dropoff, note: row.then_note }),
  };
}

function keepFilled<Key extends string>(values: Record<Key, string | null>): Partial<Record<Key, string>> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null)) as Partial<Record<Key, string>>;
}
