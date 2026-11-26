import type { AccessScope } from '../../access/access-scope.ts';
import type { Transaction } from '../../db/transaction.ts';
import { findLastPhotoMessage } from '../../documents/corrections/find-last-photo-message.ts';
import { findPapersToCorrect, type FoundPapers } from '../../documents/corrections/find-papers-to-correct.ts';
import { findQuotedPhotoMessage } from '../../documents/corrections/find-quoted-photo-message.ts';
import type { CorrectionRequest } from './correct-document-arguments.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

export const LIST_LIMIT = 20;

type NamedPointer = CorrectionRequest['pointer'];

export async function findRequestedPapers(transaction: Transaction, dependencies: AdminToolDependencies, scope: AccessScope, request: CorrectionRequest): Promise<FoundPapers> {
  const quotedPhotoId = request.allMatching ? null : await findQuotedPhoto(transaction, dependencies, scope);
  if (quotedPhotoId !== null) return findPapersOfQuotedPhoto(transaction, scope.workspaceId, request.pointer, quotedPhotoId);
  return findPapersOfLastPhoto(transaction, dependencies, scope, request);
}

async function findQuotedPhoto(transaction: Transaction, { currentMessageId }: AdminToolDependencies, scope: AccessScope): Promise<string | null> {
  if (!currentMessageId) return null;
  return findQuotedPhotoMessage(transaction, { workspaceId: scope.workspaceId, currentMessageId });
}

async function findPapersOfQuotedPhoto(transaction: Transaction, workspaceId: string, pointer: NamedPointer, quotedPhotoId: string): Promise<FoundPapers> {
  const ofQuotedPhoto = { ...pointer, lastPhotoMessageId: quotedPhotoId };
  if (!hasNamedPaper(pointer)) return findPapersToCorrect(transaction, workspaceId, ofQuotedPhoto, LIST_LIMIT);
  const named = await findPapersToCorrect(transaction, workspaceId, { ...pointer, lastPhotoMessageId: null }, LIST_LIMIT);
  if (named.total < 2) return named;
  const narrowed = await findPapersToCorrect(transaction, workspaceId, ofQuotedPhoto, LIST_LIMIT);
  return narrowed.total > 0 ? narrowed : named;
}

function hasNamedPaper(pointer: NamedPointer): boolean {
  return Object.values(pointer).some((value) => value !== null);
}

async function findPapersOfLastPhoto(transaction: Transaction, dependencies: AdminToolDependencies, scope: AccessScope, request: CorrectionRequest): Promise<FoundPapers> {
  const lastPhotoMessageId = request.fromLastPhoto ? await findLastPhoto(transaction, dependencies, scope) : null;
  if (request.fromLastPhoto && lastPhotoMessageId === null) return { papers: [], total: 0 };
  return findPapersToCorrect(transaction, scope.workspaceId, { ...request.pointer, lastPhotoMessageId }, request.allMatching ? null : LIST_LIMIT);
}

async function findLastPhoto(transaction: Transaction, { currentMessageId }: AdminToolDependencies, scope: AccessScope): Promise<string | null> {
  if (!currentMessageId) return null;
  return findLastPhotoMessage(transaction, { workspaceId: scope.workspaceId, userId: scope.userId, currentMessageId });
}
