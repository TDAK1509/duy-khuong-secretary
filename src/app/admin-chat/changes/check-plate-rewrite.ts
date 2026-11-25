import type { Database } from '../../db/transaction.ts';
import { countPapersToRewrite, readPlateRequest, type PlateCount, type PlateRequest } from '../tools/rewrite-member-plate-tool.ts';
import { findMember } from './find-member.ts';
import type { RiskyChecker } from './risky-check.ts';

const MAX_OLD_PLATES_SHOWN = 5;
const NO_PLATE_LABEL = 'chưa có biển số';

export const checkPlateRewrite: RiskyChecker = async ({ database }, scope, parsedArguments) => {
  const request = readPlateRequest(parsedArguments, scope.workspaceId);
  const member = await findMember(database, scope.workspaceId, request.ref.membershipId);
  return { targets: [member.displayName, request.plate], writeQuestion: () => describePlateRewrite(database, request, member.displayName) };
};

async function describePlateRewrite(database: Database, request: PlateRequest, memberName: string): Promise<string> {
  const counts = await countPapersToRewrite(database, request);
  const papers = counts.reduce((total, { count }) => total + count, 0);
  const fact = `Biển số ${request.plate} cũng được lưu làm thông tin về người này.`;
  if (papers === 0) return `Đổi biển số của ${memberName} thành ${request.plate}. Không có giấy tờ nào cần đổi. ${fact}`;
  return `Đổi biển số trên ${papers} giấy tờ của ${memberName} thành ${request.plate} (biển cũ: ${describeOldPlates(counts)}). ${fact}`;
}

function describeOldPlates(counts: PlateCount[]): string {
  const shown = counts.slice(0, MAX_OLD_PLATES_SHOWN).map(({ plate, count }) => `${plate ?? NO_PLATE_LABEL} ${count} giấy tờ`);
  return counts.length > MAX_OLD_PLATES_SHOWN ? `${shown.join(', ')}, và biển khác` : shown.join(', ');
}
