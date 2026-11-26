import type { AccessScope } from '../../access/access-scope.ts';
import type { Transaction } from '../../db/transaction.ts';
import { findLastPhotoMessage } from '../../documents/corrections/find-last-photo-message.ts';
import { findPapersToCorrect, type FoundPapers } from '../../documents/corrections/find-papers-to-correct.ts';
import { findQuotedPhotoMessage } from '../../documents/corrections/find-quoted-photo-message.ts';
import type { CorrectionRequest } from './correct-document-arguments.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

export const LIST_LIMIT = 20;

export async function findRequestedPapers(transaction: Transaction, dependencies: AdminToolDependencies, scope: AccessScope, request: CorrectionRequest): Promise<FoundPapers> {
  const lastPhotoMessageId = await findPhotoToCorrect(transaction, dependencies, scope, request);
  if (request.fromLastPhoto && lastPhotoMessageId === null) return { papers: [], total: 0 };
  return findPapersToCorrect(transaction, scope.workspaceId, { ...request.pointer, lastPhotoMessageId }, request.allMatching ? null : LIST_LIMIT);
}

async function findPhotoToCorrect(transaction: Transaction, dependencies: AdminToolDependencies, scope: AccessScope, request: CorrectionRequest): Promise<string | null> {
  const quotedPhotoId = await findQuotedPhoto(transaction, dependencies, scope);
  if (quotedPhotoId !== null) return quotedPhotoId;
  return request.fromLastPhoto ? findLastPhoto(transaction, dependencies, scope) : null;
}

async function findQuotedPhoto(transaction: Transaction, { currentMessageId }: AdminToolDependencies, scope: AccessScope): Promise<string | null> {
  if (!currentMessageId) return null;
  return findQuotedPhotoMessage(transaction, { workspaceId: scope.workspaceId, currentMessageId });
}

async function findLastPhoto(transaction: Transaction, { currentMessageId }: AdminToolDependencies, scope: AccessScope): Promise<string | null> {
  if (!currentMessageId) return null;
  return findLastPhotoMessage(transaction, { workspaceId: scope.workspaceId, userId: scope.userId, currentMessageId });
}
