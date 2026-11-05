import { describe, expect, it } from 'vitest';
import { summarizeRecord, type SummaryFields } from '../../../src/app/records/summarize-record.ts';

function makeFields(overrides: Partial<SummaryFields> = {}): SummaryFields {
  return {
    category: 'đổ xăng dầu',
    documentTitle: null,
    maintenanceItem: null,
    vehiclePlate: null,
    documentNumber: null,
    identifiers: [],
    ...overrides,
  };
}

describe('summarizeRecord', () => {
  it('starts with the printed title', () => {
    const fields = makeFields({
      category: 'kiểm định xe',
      documentTitle: 'Chứng nhận kiểm định an toàn kỹ thuật và bảo vệ môi trường xe cơ giới',
      vehiclePlate: '29C12345',
    });

    expect(summarizeRecord(fields)).toBe('Chứng nhận kiểm định an toàn kỹ thuật và bảo vệ môi trường xe cơ giới, xe 29C12345');
  });
});
