import { describe, expect, it } from 'vitest';
import { formatReadData } from '../../../src/app/records/format-read-data.ts';
import { buildNewRecords } from '../../../src/app/records/new-record.ts';
import { makeItem } from '../reading/make-reading.ts';

describe('formatReadData', () => {
  it('lists every saved field and each detail, in order', () => {
    const records = buildNewRecords([
      makeItem({
        category: 'bảo dưỡng',
        document_title: 'Phiếu thay dầu',
        maintenance_item: 'thay dầu máy',
        vehicle_plate: '29C-123.45',
        document_number: '0001234',
        occurred_on: '2026-10-30',
        amount_vnd: 1250000,
        identifiers: ['AB12'],
        details: [
          { label: 'Công ty', value: 'Cheng Loong' },
          { label: 'Khối lượng', value: '12.500 kg' },
        ],
      }),
    ]);

    expect(formatReadData(records)).toBe(
      [
        'Dữ liệu đã đọc:',
        'Mục 1: bảo dưỡng',
        '- Tiêu đề: Phiếu thay dầu',
        '- Biển số: 29C12345',
        '- Số phiếu: 0001234',
        '- Ngày trên giấy tờ: 30/10/2026',
        '- Số tiền: 1.250.000đ',
        '- Bảo dưỡng: thay dầu máy',
        '- Mã: AB12',
        '- Công ty: Cheng Loong',
        '- Khối lượng: 12.500 kg',
      ].join('\n'),
    );
  });

  it('leaves out a line for every null field', () => {
    const records = buildNewRecords([makeItem({ amount_vnd: null, vehicle_plate: null, identifiers: [] })]);

    const block = formatReadData(records);

    expect(block).not.toContain('Biển số');
    expect(block).not.toContain('Số tiền');
    expect(block).not.toContain('Mã');
  });

  it('numbers two records as two parts', () => {
    const records = buildNewRecords([
      makeItem({ category: 'đổ xăng dầu', amount_vnd: null, occurred_on: null, details: [{ label: 'Lít', value: '40' }] }),
      makeItem({ category: 'rửa xe', amount_vnd: null, occurred_on: null, details: [{ label: 'Loại', value: 'rửa gầm' }] }),
    ]);

    expect(formatReadData(records)).toBe(
      ['Dữ liệu đã đọc:', 'Mục 1: đổ xăng dầu', '- Lít: 40', 'Mục 2: rửa xe', '- Loại: rửa gầm'].join('\n'),
    );
  });
});
