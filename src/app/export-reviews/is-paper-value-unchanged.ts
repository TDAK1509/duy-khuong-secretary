import type { Transaction } from '../db/transaction.ts';
import { readCompanyRoles } from '../documents/corrections/company-roles.ts';
import { findPrintedLine } from '../documents/corrections/find-printed-line.ts';
import type { FoundPaper, PrintedValue } from '../documents/corrections/paper-correction.ts';
import type { CellValue } from '../documents/recorded-export.ts';
import { WEIGHT_MEANING } from '../facts/knowledge-totals.ts';
import type { CompanySlot } from '../facts/pick-fact-companies.ts';
import type { PaperField } from './build-change-candidates.ts';

const WEIGHT_PRINTED: PrintedValue = { label: WEIGHT_MEANING, value: '', meaning: WEIGHT_MEANING, number: null, unit: 'kg', typedNumber: null };

const GOODS_PRINTED: PrintedValue = { label: 'Hàng hóa', value: '', meaning: null, number: null, unit: null, typedNumber: null };

const LIST_PARTY_NAMES_SQL = `
  SELECT party.printed_name, organization.name
  FROM document_parties party
  LEFT JOIN organizations organization ON organization.id = party.organization_id AND organization.workspace_id = party.workspace_id
  WHERE party.workspace_id = $1 AND party.document_id = $2 AND party.role = ANY($3::text[])`;

export async function isPaperValueUnchanged(transaction: Transaction, workspaceId: string, paper: FoundPaper, target: { field: PaperField; before: CellValue }): Promise<boolean> {
  const { field, before } = target;
  if (field === 'date') return paper.document_date === before;
  if (field === 'plate') return paper.plate === before;
  if (field === 'number') return paper.document_number === before;
  if (field === 'weight') return (await readPrintedNumber(transaction, workspaceId, paper)) === before;
  if (field === 'goods') return ((await findPrintedLine(transaction, workspaceId, paper.id, GOODS_PRINTED))?.value ?? null) === before;
  return isCompanyUnchanged(transaction, workspaceId, paper, { slot: field, before });
}

async function readPrintedNumber(transaction: Transaction, workspaceId: string, paper: FoundPaper): Promise<number | null> {
  const line = await findPrintedLine(transaction, workspaceId, paper.id, WEIGHT_PRINTED);
  return line?.number == null ? null : Number(line.number);
}

async function isCompanyUnchanged(transaction: Transaction, workspaceId: string, paper: FoundPaper, { slot, before }: { slot: CompanySlot; before: CellValue }): Promise<boolean> {
  const roles = readCompanyRoles(slot, paper.stage);
  if (roles === null || before === null) return roles !== null;
  const parties = await transaction.query<{ printed_name: string; name: string | null }>(LIST_PARTY_NAMES_SQL, [workspaceId, paper.id, roles.replaced]);
  return parties.length === 0 || parties.some((party) => party.printed_name === before || party.name === before);
}
