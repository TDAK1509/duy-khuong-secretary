import ExcelJS from 'exceljs';

export type ExportRow = {
  document_date: string | null;
  kind: string;
  title: string | null;
  document_number: string | null;
  vehicle_plate: string | null;
  amount_vnd: number | null;
  sender_name: string | null;
};

const HEADER_LABELS = ['Ngày', 'Loại', 'Tiêu đề', 'Số chứng từ', 'Biển số', 'Số tiền (VND)', 'Người gửi'] as const;
const AMOUNT_COLUMN_INDEX = 6;

export async function buildDocumentsWorkbook(rows: ExportRow[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Giấy tờ');
  addHeaderRow(sheet);
  for (const row of rows) addDataRow(sheet, row);
  freezeHeader(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function addHeaderRow(sheet: ExcelJS.Worksheet): void {
  const row = sheet.addRow([...HEADER_LABELS]);
  row.eachCell((cell) => {
    cell.font = { bold: true };
  });
}

function addDataRow(sheet: ExcelJS.Worksheet, data: ExportRow): void {
  sheet.addRow(buildRowValues(data));
  if (data.amount_vnd !== null) {
    sheet.lastRow!.getCell(AMOUNT_COLUMN_INDEX).alignment = { horizontal: 'right' };
  }
}

function buildRowValues(data: ExportRow): (string | null)[] {
  return [
    data.document_date !== null ? formatDate(data.document_date) : null,
    data.kind,
    data.title,
    data.document_number,
    data.vehicle_plate,
    data.amount_vnd !== null ? formatVnd(data.amount_vnd) : null,
    data.sender_name,
  ];
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function formatVnd(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function freezeHeader(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
