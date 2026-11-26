import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import type { AccessScope } from '../../../src/app/access/access-scope.ts';
import { AdminTextGuard } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runChatTool } from '../../../src/app/admin-chat/tools/run-chat-tool.ts';
import type { AdminToolDependencies } from '../../../src/app/admin-chat/tools/tool-dependencies.ts';
import { WaitingChanges } from '../../../src/app/admin-chat/changes/waiting-changes.ts';
import { CreatedInvites } from '../../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../../src/app/admin-chat/source-cards.ts';
import { A_ADMIN_USER_ID, FIXED_NOW, WORKSPACE_A_ID } from './seed-ids.ts';

const A_ADMIN: AccessScope = { workspaceId: WORKSPACE_A_ID, userId: A_ADMIN_USER_ID, role: 'admin' };

export async function callChatTool(database: PostgresPool, name: string, toolArguments: object): Promise<string> {
  const call = { id: 'leak-test-call', name, argumentsJson: JSON.stringify(toolArguments) };
  return runChatTool(buildToolDependencies(database), A_ADMIN, call);
}

function buildToolDependencies(database: PostgresPool): AdminToolDependencies {
  return {
    database,
    clock: { now: () => FIXED_NOW },
    attachments: new PhotoAttachments(),
    sources: new SourceCards(),
    created: new CreatedTasks(null),
    invites: new CreatedInvites(),
    guard: new AdminTextGuard(false),
    waiting: new WaitingChanges(),
  };
}
