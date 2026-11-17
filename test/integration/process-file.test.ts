import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const ADMIN_USER = 'zu-admin';
const ORDERS_HEADER = 'date,plate,title,amount';
const ORDERS_FIVE_ROWS = [
  '2026-01-01,51A,Giao hàng,100000',
  '2026-01-02,51B,Nhận hàng,200000',
  '2026-01-03,51C,Giao hàng,300000',
  '2026-01-04,51D,Giao hàng,400000',
  '2026-01-05,51E,Nhận hàng,500000',
];

const INVOICE_KIND = 'Hóa đơn';

const INVOICE_MAPPING_READER_OUTPUT = {
  document_kind: INVOICE_KIND,
  column_mapping: {
    date: 'document_date',
    plate: 'vehicle_plate',
    title: 'title',
    amount: 'detail',
  },
  date_format: 'YYYY-MM-DD',
};

describe('processing a parsed admin sheet', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    await insertMember(database, { workspaceId, externalUserId: ADMIN_USER, displayName: 'Admin', role: 'admin' });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('skips a row with an empty title cell and names the skipped row in the reply', async () => {
    const rows = [...ORDERS_FIVE_ROWS];
    rows[1] = '2026-01-02,51B,,200000';
    await uploadAndParseCsv(harness, 'orders.csv', [ORDERS_HEADER, ...rows].join('\n') + '\n');
    harness.reader.answerWith(INVOICE_MAPPING_READER_OUTPUT);

    await harness.runProcessFiles();

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 4 }]);
    expect(
      await database.query<{ body: string }>(
        `SELECT body FROM outbound_messages WHERE external_user_id = '${ADMIN_USER}' ORDER BY created_at DESC LIMIT 1`,
      ),
    ).toEqual([{ body: 'Đã lưu 4/5 dòng vào chứng từ "Hóa đơn". Bỏ qua các dòng: 2.' }]);
  });

  it('skips a row whose date cell cannot be parsed with the chosen format', async () => {
    const rows = [...ORDERS_FIVE_ROWS];
    rows[3] = 'not-a-date,51D,Giao hàng,400000';
    await uploadAndParseCsv(harness, 'orders.csv', [ORDERS_HEADER, ...rows].join('\n') + '\n');
    harness.reader.answerWith(INVOICE_MAPPING_READER_OUTPUT);

    await harness.runProcessFiles();

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 4 }]);
    expect(
      await database.query<{ body: string }>(
        `SELECT body FROM outbound_messages WHERE external_user_id = '${ADMIN_USER}' ORDER BY created_at DESC LIMIT 1`,
      ),
    ).toEqual([{ body: 'Đã lưu 4/5 dòng vào chứng từ "Hóa đơn". Bỏ qua các dòng: 4.' }]);
  });

  it('skips a row with an empty date cell and names the skipped row in the reply', async () => {
    const rows = [...ORDERS_FIVE_ROWS];
    rows[2] = ',51C,Giao hàng,300000';
    await uploadAndParseCsv(harness, 'orders.csv', [ORDERS_HEADER, ...rows].join('\n') + '\n');
    harness.reader.answerWith(INVOICE_MAPPING_READER_OUTPUT);

    await harness.runProcessFiles();

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 4 }]);
    expect(
      await database.query<{ body: string }>(
        `SELECT body FROM outbound_messages WHERE external_user_id = '${ADMIN_USER}' ORDER BY created_at DESC LIMIT 1`,
      ),
    ).toEqual([{ body: 'Đã lưu 4/5 dòng vào chứng từ "Hóa đơn". Bỏ qua các dòng: 3.' }]);
  });

  it('saves every row of a five-row sheet as a document of the inferred kind', async () => {
    await uploadAndParseCsv(harness, 'orders.csv', [ORDERS_HEADER, ...ORDERS_FIVE_ROWS].join('\n') + '\n');
    harness.reader.answerWith(INVOICE_MAPPING_READER_OUTPUT);

    await harness.runProcessFiles();

    expect(
      await database.query<{ kind: string; title: string; plate: string; document_date: string }>(
        `SELECT kind, title, vehicle_plate AS plate, to_char(document_date, 'YYYY-MM-DD') AS document_date
           FROM documents WHERE workspace_id = '${workspaceId}' ORDER BY document_date`,
      ),
    ).toEqual([
      { kind: INVOICE_KIND, title: 'Giao hàng', plate: '51A', document_date: '2026-01-01' },
      { kind: INVOICE_KIND, title: 'Nhận hàng', plate: '51B', document_date: '2026-01-02' },
      { kind: INVOICE_KIND, title: 'Giao hàng', plate: '51C', document_date: '2026-01-03' },
      { kind: INVOICE_KIND, title: 'Giao hàng', plate: '51D', document_date: '2026-01-04' },
      { kind: INVOICE_KIND, title: 'Nhận hàng', plate: '51E', document_date: '2026-01-05' },
    ]);
  });
});

async function uploadAndParseCsv(harness: IntakeHarness, fileName: string, text: string): Promise<void> {
  const bytes = new TextEncoder().encode(text);
  const fileUrl = `https://zdn.vn/${fileName}`;
  harness.channel.attachments.set(fileUrl, { ok: true, bytes });
  await harness.receiveFile(ADMIN_USER, { fileUrl, fileName, fileSize: bytes.length });
  await harness.runParseFiles();
}
