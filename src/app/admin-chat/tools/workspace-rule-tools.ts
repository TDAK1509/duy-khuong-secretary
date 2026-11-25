import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { deleteWorkspaceRule } from '../../workspace-rules/delete-workspace-rule.ts';
import { listWorkspaceRules, type WorkspaceRule } from '../../workspace-rules/list-workspace-rules.ts';
import { MAX_RULE_LENGTH, MAX_RULES, saveWorkspaceRule } from '../../workspace-rules/save-workspace-rule.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { failTool, ToolRefusal } from './tool-result.ts';

const NO_MESSAGE_TEXT_ERROR = 'Tin nhắn hiện tại không có chữ do quản lý gõ, nên chưa lưu quy tắc nào.';
const MESSAGE_TOO_LONG_ERROR = `Tin nhắn dài hơn ${MAX_RULE_LENGTH} ký tự, nên chưa lưu quy tắc nào. Nhờ quản lý viết ngắn hơn.`;
const RULES_FULL_ERROR = `Đã đủ ${MAX_RULES} quy tắc, nên chưa lưu quy tắc mới. Các quy tắc đã lưu nằm trong "rules". Xóa bớt một quy tắc rồi gửi lại.`;
const RULE_NOT_FOUND_ERROR = 'Không tìm thấy quy tắc này. Gọi list_rules để lấy đúng id.';

const noArgumentsSchema = z.strictObject({});
const deleteArgumentsSchema = z.strictObject({ rule_id: z.string() });

export async function runSaveRule({ database, currentMessageText }: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  noArgumentsSchema.parse(parsedArguments);
  const rule = readRuleFromMessage(currentMessageText ?? null);
  const result = await saveWorkspaceRule(database, { workspaceId: scope.workspaceId, authorUserId: scope.userId, rule });
  if (result.action === 'full') return JSON.stringify({ ok: false, error: RULES_FULL_ERROR, rules: result.rules.map(describeRule) });
  return JSON.stringify({ ok: true, rule_id: result.ruleId, rule });
}

function readRuleFromMessage(messageText: string | null): string {
  const rule = messageText?.trim() ?? '';
  if (rule === '') throw new ToolRefusal(NO_MESSAGE_TEXT_ERROR);
  if (rule.length > MAX_RULE_LENGTH) throw new ToolRefusal(MESSAGE_TOO_LONG_ERROR);
  return rule;
}

export async function runListRules(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  noArgumentsSchema.parse(parsedArguments);
  const rules = await listWorkspaceRules(database, scope.workspaceId);
  return JSON.stringify({ rules: rules.map(describeRule) });
}

export async function runDeleteRule(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { rule_id: ruleId } = deleteArgumentsSchema.parse(parsedArguments);
  if (!z.uuid().safeParse(ruleId).success) return failTool(RULE_NOT_FOUND_ERROR);
  const deletedRule = await deleteWorkspaceRule(database, scope.workspaceId, ruleId);
  if (deletedRule === null) return failTool(RULE_NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, rule: deletedRule });
}

function describeRule({ id, rule, authorName }: WorkspaceRule): Record<string, string | null> {
  return { id, rule, author: authorName };
}
