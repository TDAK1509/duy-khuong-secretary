import type { ToolCall } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { toAccentFreeForm } from '../../reading/normalize.ts';
import type { GuardedTool } from '../tools/admin-text-guard.ts';
import type { AdminToolDependencies } from '../tools/tool-dependencies.ts';
import { buildWaitingResult, failFromError } from '../tools/tool-result.ts';
import { checkDocumentDeletion } from './check-document-deletion.ts';
import { checkInvite } from './check-invite.ts';
import { checkMemberFactsErasure, checkMemberRemoval } from './check-member-change.ts';
import { checkMemoryErasure } from './check-memory-erasure.ts';
import { checkPlateRewrite } from './check-plate-rewrite.ts';
import { checkTemplateSave } from './check-template-save.ts';
import type { RiskyCheck, RiskyChecker, RiskyTarget } from './risky-check.ts';

const RISKY_CHECKERS: Record<GuardedTool, RiskyChecker> = {
  remove_member: checkMemberRemoval,
  create_invite: checkInvite,
  forget_all: checkMemoryErasure,
  forget_all_member_facts: checkMemberFactsErasure,
  rewrite_member_plate: checkPlateRewrite,
  save_document_template: checkTemplateSave,
  delete_document: checkDocumentDeletion,
};

export type GuardedToolCall = ToolCall & { name: GuardedTool };

export async function holdRiskyCall(dependencies: AdminToolDependencies, scope: AccessScope, call: GuardedToolCall): Promise<string | null> {
  try {
    const parsedArguments: unknown = JSON.parse(call.argumentsJson);
    const check = await RISKY_CHECKERS[call.name](dependencies, scope, parsedArguments);
    if (canRunAtOnce(dependencies, check)) return null;
    dependencies.waiting.add({ call: { name: call.name, arguments: parsedArguments }, question: await check.writeQuestion() });
    return buildWaitingResult();
  } catch (error) {
    return failFromError(error);
  }
}

function canRunAtOnce({ guard, currentMessageText }: AdminToolDependencies, { targets }: RiskyCheck): boolean {
  return !guard.hasSeenOtherText() && holdsAllTargets(currentMessageText ?? '', targets);
}

function holdsAllTargets(messageText: string, targets: RiskyTarget[] | null): boolean {
  if (targets === null) return false;
  return targets.every((target) => holdsTarget(messageText, target));
}

function holdsTarget(messageText: string, { kind, text }: RiskyTarget): boolean {
  if (kind === 'name') return holdsWords(listWords(messageText), listWords(text));
  const plateKey = buildMatchKey(text);
  return plateKey !== '' && buildMatchKey(messageText).includes(plateKey);
}

function listWords(text: string): string[] {
  return (toAccentFreeForm(text) ?? '').split(/[^a-z0-9]+/).filter((word) => word !== '');
}

function holdsWords(messageWords: string[], targetWords: string[]): boolean {
  if (targetWords.length === 0) return false;
  return messageWords.some((_word, start) => targetWords.every((word, offset) => messageWords[start + offset] === word));
}
