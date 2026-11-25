import { memberArgumentsSchema } from '../tools/member-fact-tools.ts';
import { CANNOT_REMOVE_SELF_ERROR, removeMemberArgumentsSchema } from '../tools/remove-member-tool.ts';
import { ToolRefusal } from '../tools/tool-result.ts';
import { findMember } from './find-member.ts';
import type { RiskyChecker } from './risky-check.ts';

export const checkMemberRemoval: RiskyChecker = async ({ database }, scope, parsedArguments) => {
  const { member_id: memberId } = removeMemberArgumentsSchema.parse(parsedArguments);
  const member = await findMember(database, scope.workspaceId, memberId);
  if (member.userId === scope.userId) throw new ToolRefusal(CANNOT_REMOVE_SELF_ERROR);
  const question = `Xóa ${member.displayName} khỏi nhóm. Thông tin đã lưu về người này cũng bị xóa.`;
  return { targets: [member.displayName], writeQuestion: () => question };
};

export const checkMemberFactsErasure: RiskyChecker = async ({ database }, scope, parsedArguments) => {
  const { member_id: memberId } = memberArgumentsSchema.parse(parsedArguments);
  const member = await findMember(database, scope.workspaceId, memberId);
  const question = `Xóa mọi thông tin đã lưu về ${member.displayName}.`;
  return { targets: [member.displayName], writeQuestion: () => question };
};
