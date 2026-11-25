import { labelRole } from '../../workspaces/role-label.ts';
import { readInviteRequest } from '../tools/create-invite-tool.ts';
import type { RiskyChecker } from './risky-check.ts';

const ADMIN_INVITE_EFFECT = ' Quản lý xem được dữ liệu của cả nhóm.';

export const checkInvite: RiskyChecker = async (_dependencies, _scope, parsedArguments) => {
  const { displayName, role } = readInviteRequest(parsedArguments);
  const question = `Mời ${displayName} vào nhóm với vai trò ${labelRole(role)}.${role === 'admin' ? ADMIN_INVITE_EFFECT : ''}`;
  return { targets: role === 'member' ? [displayName] : null, writeQuestion: () => question };
};
