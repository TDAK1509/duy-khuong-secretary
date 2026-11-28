import type { PhotoStorage } from '../../../services/storage/photo-storage.ts';
import { runInTransaction, type Database } from '../../db/transaction.ts';
import { attachExamplePhotos, type ExampleLoader, type StoredExample } from '../../reading/template-examples.ts';

const LIST_EXAMPLES_SQL = `
  SELECT position, image_key, expected_reading
  FROM document_template_examples
  WHERE workspace_id = $1 AND template_id = $2
  ORDER BY position`;

type ExampleRow = { position: number; image_key: string; expected_reading: Record<string, unknown> };

export function createExampleLoader(database: Database, workspaceId: string, photoStorage: PhotoStorage | null): ExampleLoader {
  return async (templateId) => {
    if (photoStorage === null) return [];
    const stored = await listStoredExamples(database, workspaceId, templateId);
    return attachExamplePhotos(photoStorage, stored);
  };
}

function listStoredExamples(database: Database, workspaceId: string, templateId: string): Promise<StoredExample[]> {
  return runInTransaction(database, (transaction) =>
    transaction.withScope({ workspaceId }, async () => {
      const rows = await transaction.query<ExampleRow>(LIST_EXAMPLES_SQL, [workspaceId, templateId]);
      return rows.map((row) => ({ position: row.position, imageKey: row.image_key, expectedReading: row.expected_reading }));
    }),
  );
}
