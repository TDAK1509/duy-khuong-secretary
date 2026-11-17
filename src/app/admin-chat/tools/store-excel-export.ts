import { randomUUID } from 'node:crypto';
import type { FileStorage } from '../../../services/storage/file-storage.ts';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PRESIGN_EXPIRES_SECONDS = 86400;
export const EXPORT_EXPIRES_HOURS = 24;
export const EXPORT_NOT_CONFIGURED_ERROR = 'Tính năng xuất Excel chưa được cấu hình.';

export type StoredExport = { url: string; filename: string };

export async function storeExcelExport(storage: FileStorage, workspaceId: string, bytes: Uint8Array, filePrefix: string): Promise<StoredExport> {
  const id = randomUUID();
  const key = `workspace_${workspaceId}/exports/${id}.xlsx`;
  await storage.put(key, bytes, XLSX_CONTENT_TYPE);
  const url = await storage.presignedUrl(key, PRESIGN_EXPIRES_SECONDS);
  return { url, filename: `${filePrefix}-${id.slice(0, 8)}.xlsx` };
}
