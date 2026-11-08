import { z } from 'zod';
import type { Clock } from '../../services/clock/clock.ts';
import type { McpToolResult } from '../../services/mcp/mcp-endpoint.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { AccessScope } from '../access/access-scope.ts';
import { isCurrentWorkspaceAdmin } from '../access/is-current-admin.ts';
import { toDatabaseScope } from '../access/to-database-scope.ts';
import { REFUSAL_ERROR } from '../admin-chat/tools/tool-result.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { scopeDatabase } from '../db/scoped-database.ts';
import { planReply, type ReplyPlan } from '../intake/plan-reply.ts';
import { readWithReader } from '../intake/read-message.ts';
import { rejectDuplicates } from '../intake/run-reply-stage.ts';
import { storeDocuments } from '../documents/store-documents.ts';
import { insertRecords } from '../records/insert-records.ts';
import { storeMcpMessage } from './store-mcp-message.ts';

const NO_WORK_DATA_TEXT = 'Không có dữ liệu công việc để lưu.';
const UNCLEAR_TEXT = 'Chưa lưu vì nội dung chưa đủ rõ. Hãy gửi lại đầy đủ việc gì, cho xe nào, ngày nào và số tiền nếu có.';
const READER_FAILED_TEXT = 'Chưa lưu được vì Trợ lý đang lỗi. Hãy thử lại sau.';

const argumentsSchema = z.object({ text: z.string() });

export type SaveRecordRuntime = { database: Database; clock: Clock; reader: ReaderService };

export async function saveRecordFromText(runtime: SaveRecordRuntime, scope: AccessScope, args: unknown): Promise<McpToolResult> {
  const { text } = argumentsSchema.parse(args);
  const attempt = await readWithReader(runtime.reader, runtime.clock.now(), { text, photo: null }, []);
  if (!attempt.ok) return { text: READER_FAILED_TEXT, isError: true };
  const plan = planReply(attempt, false);
  if (!plan.saved) return { text: plan.isUnclear ? UNCLEAR_TEXT : NO_WORK_DATA_TEXT, isError: false };
  return saveReadRecords(runtime.database, scope, text, plan);
}

function saveReadRecords(database: Database, scope: AccessScope, text: string, plan: ReplyPlan): Promise<McpToolResult> {
  return runInTransaction(scopeDatabase(database, toDatabaseScope(scope)), async (transaction) => {
    if (!(await isCurrentWorkspaceAdmin(transaction, scope))) return { text: REFUSAL_ERROR, isError: true };
    const { saved, replyText } = await rejectDuplicates(transaction, scope.workspaceId, plan);
    if (saved) await storeRecords(transaction, scope, text, plan);
    return { text: replyText, isError: false };
  });
}

async function storeRecords(transaction: Transaction, { workspaceId, userId }: AccessScope, text: string, plan: ReplyPlan): Promise<void> {
  const messageId = await storeMcpMessage(transaction, { workspaceId, userId }, text);
  await storeDocuments(transaction, { id: messageId, workspaceId }, plan);
  if (plan.saved) await insertRecords(transaction, { id: messageId, workspaceId, userId }, plan.saved);
}
