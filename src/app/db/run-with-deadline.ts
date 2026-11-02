import { runInTransaction, type Database, type Transaction } from './transaction.ts';

export async function runWithDeadline<Result>(
  database: Database,
  deadlineMs: number,
  work: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  return runInTransaction(database, async (transaction) => {
    await transaction.query(`SET LOCAL lock_timeout = ${deadlineMs}`);
    await transaction.query(`SET LOCAL statement_timeout = ${deadlineMs}`);
    return work(transaction);
  });
}
