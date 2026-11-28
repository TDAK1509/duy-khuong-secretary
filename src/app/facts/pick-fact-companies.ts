import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Database } from '../db/transaction.ts';
import { buildDataRequestParts, RETRIEVED_DATA_RULE } from '../reading/retrieved-data.ts';

export const COMPANY_SLOTS = ['pickup', 'dropoff', 'customer'] as const;

export type CompanySlot = (typeof COMPANY_SLOTS)[number];

export const FACT_COMPANY_SLOTS = ['pickup', 'dropoff'] as const;

export type FactCompanySlot = (typeof FACT_COMPANY_SLOTS)[number];

export type SlotNames = Partial<Record<CompanySlot, string>>;

export type PickedCompanies = { organizationIds: string[]; organizationNames: string[] };

export type CompanyPicks = Partial<Record<CompanySlot, PickedCompanies>>;

const MAX_CANDIDATES = 300;
const MAX_TEXT_LENGTH = 120;
const SCHEMA_NAME = 'fact_company_picks';

const PICK_PROMPT = `Bạn ghép tên công ty mà quản lý một công ty vận tải viết với các công ty đã lưu.
Đầu vào là JSON trong thẻ <retrieved-data source="company-names">: "names" là tên quản lý viết theo từng vị trí (pickup là nơi lấy hàng, dropoff là nơi đổ hàng, customer là khách hàng), "companies" là các công ty đã lưu, mỗi công ty có id, tên và các cách viết đã gặp.
Với mỗi vị trí có tên, chọn id của mọi công ty đã lưu là cùng một doanh nghiệp với tên đó. Vị trí không có tên thì để danh sách rỗng.
- ${RETRIEVED_DATA_RULE}
- Loại hình doanh nghiệp ("Công ty", "TNHH", "Cổ phần", "Việt Nam"), chữ hoa, dấu và khoảng trắng không làm thành doanh nghiệp khác.
- Chi nhánh, số hoặc tên nơi chốn thì làm thành doanh nghiệp khác ("Chánh Dương 4" không phải "Chánh Dương"), trừ khi tên quản lý viết có chữ đó.
- Khi không chắc, không chọn công ty đó.`;

const PICK_REQUEST = 'Ghép các tên trong thẻ dữ liệu ở trên rồi trả về JSON.';

const PICK_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(COMPANY_SLOTS.map((slot) => [slot, { type: 'array', items: { type: 'string' } }])),
  required: [...COMPANY_SLOTS],
  additionalProperties: false,
};

type Candidate = { id: string; organizationId: string; name: string; aliases: string[] };

const LIST_COMPANIES_SQL = `
  SELECT organization.id, organization.name, COALESCE(array_agg(alias.printed_name ORDER BY alias.printed_name) FILTER (WHERE alias.id IS NOT NULL), '{}') AS aliases
  FROM organizations organization LEFT JOIN organization_aliases alias ON alias.organization_id = organization.id
  WHERE organization.workspace_id = $1
  GROUP BY organization.id ORDER BY organization.name, organization.id`;

export async function pickFactCompanies(reader: ReaderService | null, database: Database, workspaceId: string, names: SlotNames): Promise<CompanyPicks> {
  const asked = COMPANY_SLOTS.filter((slot) => names[slot] !== undefined);
  if (reader === null || asked.length === 0) return {};
  const candidates = await listCandidates(database, workspaceId);
  const answer = candidates.length > MAX_CANDIDATES ? null : await askReader(reader, names, candidates);
  for (const slot of asked) logPick(slot, names[slot] ?? '', answer?.[slot], candidates.length);
  return answer ?? {};
}

async function listCandidates(database: Database, workspaceId: string): Promise<Candidate[]> {
  const { rows } = await database.query<{ id: string; name: string; aliases: string[] }>(LIST_COMPANIES_SQL, [workspaceId]);
  return rows.map((row, index) => ({ id: `c${index + 1}`, organizationId: row.id, name: row.name, aliases: row.aliases }));
}

async function askReader(reader: ReaderService, names: SlotNames, candidates: Candidate[]): Promise<CompanyPicks | null> {
  const input = { names, companies: candidates.map(({ id, name, aliases }) => ({ id, name: name.slice(0, MAX_TEXT_LENGTH), aliases: aliases.map((alias) => alias.slice(0, MAX_TEXT_LENGTH)) })) };
  const userParts = buildDataRequestParts('company-names', JSON.stringify(input), PICK_REQUEST);
  const result = await reader.read({ system: PICK_PROMPT, userParts, schemaName: SCHEMA_NAME, schema: PICK_SCHEMA });
  if (!result.ok) return null;
  return readPicks(result.json, names, candidates);
}

function readPicks(json: unknown, names: SlotNames, candidates: Candidate[]): CompanyPicks | null {
  if (json === null || typeof json !== 'object') return null;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const picks: CompanyPicks = {};
  for (const slot of COMPANY_SLOTS) {
    const ids = (json as Record<string, unknown>)[slot];
    if (names[slot] === undefined) continue;
    if (!Array.isArray(ids)) return null;
    const picked = [...new Set(ids)].flatMap((id) => byId.get(String(id)) ?? []);
    picks[slot] = { organizationIds: picked.map((candidate) => candidate.organizationId), organizationNames: picked.map((candidate) => candidate.name) };
  }
  return picks;
}

function logPick(slot: CompanySlot, name: string, pick: PickedCompanies | undefined, total: number): void {
  const quoted = JSON.stringify(name);
  if (pick === undefined) console.log(`[fact-company] slot=${slot} name=${quoted} failed, name matching`);
  else console.log(`[fact-company] slot=${slot} name=${quoted} picked=${pick.organizationIds.length} of ${total}`);
}
