import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { createToolHarness } from './tool-harness.ts';

export function callChatTool(database: PostgresPool, name: string, toolArguments: object): Promise<string> {
  return createToolHarness(database).runTool('chat-gate', name, toolArguments);
}
