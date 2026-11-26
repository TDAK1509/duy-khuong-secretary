import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import type { AccessScope } from '../../access/access-scope.ts';
import { ADMIN_TOOLS } from './admin-tools.ts';
import { MEMORY_TOOLS } from './memory-tools.ts';

export function listChatTools(role: AccessScope['role']): ToolSpec[] {
  return role === 'admin' ? ALL_CHAT_TOOLS : [];
}

export const ALL_CHAT_TOOLS: ToolSpec[] = [...ADMIN_TOOLS, ...MEMORY_TOOLS];
