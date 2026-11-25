import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { buildMatchKey } from '../../documents/build-match-key.ts';
import { joinGoodsNames, type GoodsNameToJoin } from '../../goods-names/join-goods-names.ts';
import { listGoodsNames, type GoodsName } from '../../goods-names/list-goods-names.ts';
import { removeGoodsName } from '../../goods-names/remove-goods-name.ts';
import { failTool, ToolRefusal } from './tool-result.ts';

const MAX_WRITTEN_NAMES = 20;
const MAX_WRITTEN_NAME_LENGTH = 200;
const MAX_SHOWN_NAME_LENGTH = 80;

const NO_WRITTEN_NAMES_ERROR = `Cần từ 1 đến ${MAX_WRITTEN_NAMES} cách viết tên hàng, nên chưa gộp tên nào.`;
const INVALID_WRITTEN_NAME_ERROR = `Mỗi cách viết tên hàng cần có chữ hoặc số và tối đa ${MAX_WRITTEN_NAME_LENGTH} ký tự, nên chưa gộp tên nào.`;
const INVALID_SHOWN_NAME_ERROR = `Tên hiển thị cần từ 1 đến ${MAX_SHOWN_NAME_LENGTH} ký tự, nên chưa gộp tên nào.`;
const GOODS_NAME_NOT_FOUND_ERROR = 'Không tìm thấy cách viết này trong các tên hàng đã gộp. Gọi list_goods_names để xem các cách viết đã gộp.';

const joinArgumentsSchema = z.strictObject({ written_names: z.array(z.string()), shown_name: z.string() });
const noArgumentsSchema = z.strictObject({});
const removeArgumentsSchema = z.strictObject({ written_name: z.string() });

export async function runJoinGoodsNames(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = joinArgumentsSchema.parse(parsedArguments);
  const names = readWrittenNames(args.written_names);
  const shownName = readShownName(args.shown_name);
  const joined = await joinGoodsNames(database, { workspaceId: scope.workspaceId, authorUserId: scope.userId, names, shownName });
  return JSON.stringify({ ok: true, shown_name: shownName, joined: joined.map(({ writtenName, replacedShownName }) => ({ written_name: writtenName, replaced_shown_name: replacedShownName })) });
}

function readWrittenNames(writtenNames: string[]): GoodsNameToJoin[] {
  if (writtenNames.length === 0 || writtenNames.length > MAX_WRITTEN_NAMES) throw new ToolRefusal(NO_WRITTEN_NAMES_ERROR);
  const names = writtenNames.map(readWrittenName);
  return names.filter(({ matchKey }, position) => names.findIndex((name) => name.matchKey === matchKey) === position);
}

function readWrittenName(writtenName: string): GoodsNameToJoin {
  const trimmed = writtenName.trim();
  const matchKey = buildMatchKey(trimmed);
  if (matchKey === '' || trimmed.length > MAX_WRITTEN_NAME_LENGTH) throw new ToolRefusal(INVALID_WRITTEN_NAME_ERROR);
  return { writtenName: trimmed, matchKey };
}

function readShownName(shownName: string): string {
  const trimmed = shownName.trim();
  if (trimmed === '' || trimmed.length > MAX_SHOWN_NAME_LENGTH) throw new ToolRefusal(INVALID_SHOWN_NAME_ERROR);
  return trimmed;
}

export async function runListGoodsNames(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  noArgumentsSchema.parse(parsedArguments);
  const goodsNames = await listGoodsNames(database, scope.workspaceId);
  return JSON.stringify({ goods_names: goodsNames.map(describeGoodsName) });
}

function describeGoodsName({ writtenName, shownName, authorName }: GoodsName): Record<string, string | null> {
  return { written_name: writtenName, shown_name: shownName, author: authorName };
}

export async function runRemoveGoodsName(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { written_name: writtenName } = removeArgumentsSchema.parse(parsedArguments);
  const matchKey = buildMatchKey(writtenName);
  const removed = matchKey === '' ? null : await removeGoodsName(database, scope.workspaceId, matchKey);
  if (removed === null) return failTool(GOODS_NAME_NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, written_name: removed.writtenName, shown_name: removed.shownName });
}
