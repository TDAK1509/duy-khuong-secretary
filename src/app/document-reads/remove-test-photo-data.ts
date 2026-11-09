import { runInTransaction, type Database } from '../db/transaction.ts';
import { findTestPhotosToRemove } from './find-test-photos-to-remove.ts';
import { recordDocumentRead } from './record-document-read.ts';

export async function removeTestPhotoData(scoped: Database, workspaceId: string, testPhotoIds: string[]): Promise<number> {
  const { messageIds } = await findTestPhotosToRemove(scoped, workspaceId, testPhotoIds);
  for (const id of messageIds) {
    await runInTransaction(scoped, async (transaction) => {
      await transaction.query('DELETE FROM records WHERE message_id = $1', [id]);
      await recordDocumentRead(transaction, { id, workspaceId }, 'test_data');
    });
  }
  return messageIds.length;
}
