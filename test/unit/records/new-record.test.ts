import { describe, expect, it } from 'vitest';
import { buildNewRecords } from '../../../src/app/records/new-record.ts';
import { makeItem } from '../reading/make-reading.ts';

describe('buildNewRecords', () => {
  it('saves a blank category as khác', () => {
    const [record] = buildNewRecords([makeItem({ category: '  ' })]);

    expect(record?.category).toBe('khác');
  });

  it('saves a blank printed title as no title', () => {
    const [record] = buildNewRecords([makeItem({ document_title: '  ' })]);

    expect(record?.documentTitle).toBeNull();
  });
});
