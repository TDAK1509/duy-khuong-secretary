import type { AccessScope } from '../../../src/app/access/access-scope.ts';
import { AdminTextGuard } from '../../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runChatTool } from '../../../src/app/admin-chat/tools/run-chat-tool.ts';
import { runToolInScope } from '../../../src/app/admin-chat/tools/run-admin-tool.ts';
import type { AdminToolDependencies } from '../../../src/app/admin-chat/tools/tool-dependencies.ts';
import { WaitingChanges } from '../../../src/app/admin-chat/changes/waiting-changes.ts';
import { CreatedInvites } from '../../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../../src/app/admin-chat/source-cards.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { ATTACK_TEXT } from './attack-text.ts';
import { FakeFileStorage } from './fake-file-storage.ts';
import { RecordingReader } from './recording-reader.ts';
import { A_ADMIN_USER_ID, FIXED_NOW, WORKSPACE_A_ID } from './seed-ids.ts';

const A_ADMIN: AccessScope = { workspaceId: WORKSPACE_A_ID, userId: A_ADMIN_USER_ID, role: 'admin' };

export type ToolPath = 'chat-gate' | 'confirmed';

export type ToolHarness = {
  dependencies: AdminToolDependencies;
  storage: FakeFileStorage;
  companyReader: RecordingReader;
  dropOffReader: RecordingReader;
  runTool(path: ToolPath, name: string, toolArguments: object): Promise<string>;
};

export function createToolHarness(database: PostgresPool): ToolHarness {
  const storage = new FakeFileStorage();
  const companyReader = new RecordingReader();
  const dropOffReader = new RecordingReader();
  const dependencies = buildToolDependencies({ database, storage, companyReader, dropOffReader });
  return { dependencies, storage, companyReader, dropOffReader, runTool: (path, name, toolArguments) => runTool(dependencies, path, name, toolArguments) };
}

type DependencyParts = Pick<ToolHarness, 'storage' | 'companyReader' | 'dropOffReader'> & { database: PostgresPool };

function buildToolDependencies({ database, storage, companyReader, dropOffReader }: DependencyParts): AdminToolDependencies {
  return {
    database,
    clock: { now: () => FIXED_NOW },
    attachments: new PhotoAttachments(),
    sources: new SourceCards(),
    created: new CreatedTasks('leak-test-message'),
    invites: new CreatedInvites(),
    guard: new AdminTextGuard(false),
    waiting: new WaitingChanges(),
    fileStorage: storage,
    companyReader,
    dropOffReader,
    currentMessageText: ATTACK_TEXT,
  };
}

function runTool(dependencies: AdminToolDependencies, path: ToolPath, name: string, toolArguments: object): Promise<string> {
  const call = { id: 'leak-test-call', name, argumentsJson: JSON.stringify(toolArguments) };
  return path === 'chat-gate' ? runChatTool(dependencies, A_ADMIN, call) : runToolInScope(dependencies, A_ADMIN, call);
}
