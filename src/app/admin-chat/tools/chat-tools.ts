import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { ADMIN_TOOLS } from './admin-tools.ts';
import { MEMBER_TOOLS } from './member-tools.ts';

export function listChatTools(role: AccessScope['role']): ToolSpec[] {
  return role === 'admin' ? ADMIN_TOOLS : MEMBER_TOOLS;
}
