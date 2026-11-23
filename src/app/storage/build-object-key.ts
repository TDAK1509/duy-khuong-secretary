import { formatVietnamCompactDate } from '../time/format-vietnam-compact-date.ts';

export type ObjectKeyParts = {
  workspaceId: string;
  userId: string;
  at: Date;
  objectId: string;
  extension: string;
};

export function buildObjectKey({ workspaceId, userId, at, objectId, extension }: ObjectKeyParts): string {
  return `workspaces/${workspaceId}/${formatVietnamCompactDate(at)}/${userId}/${objectId}.${extension}`;
}
