import { describe, expect, it } from 'vitest';
import { READER_SCHEMA } from '../../../src/app/reading/reader-schema.ts';

describe('READER_SCHEMA', () => {
  it('asks for a nullable number and unit on every detail', () => {
    const detail = readDetailSchema();

    expect(detail.properties['number']).toEqual({ type: ['number', 'null'] });
    expect(detail.properties['unit']).toEqual({ type: ['string', 'null'] });
    expect(detail.required).toEqual(['label', 'value', 'number', 'unit', 'meaning', 'item', 'date_time']);
  });

  it('asks for the printed title of every item, null when there is none', () => {
    const item = readItemSchema();

    expect(item.properties['document_title']).toEqual({ type: ['string', 'null'] });
    expect(item.required).toContain('document_title');
  });

  it('asks whether the photo needs an explanation before it can be saved', () => {
    const properties = READER_SCHEMA['properties'] as Record<string, unknown>;

    expect(properties['needs_explanation']).toEqual({ type: 'boolean' });
    expect(READER_SCHEMA['required']).toContain('needs_explanation');
  });

  it('leaves the category as free text', () => {
    expect(readItemSchema().properties['category']).toEqual({ type: 'string' });
  });
});

type ObjectSchema = { properties: Record<string, unknown>; required: string[] };

function readDetailSchema(): ObjectSchema {
  return (readItemSchema().properties['details'] as { items: ObjectSchema }).items;
}

function readItemSchema(): ObjectSchema {
  const { items } = (READER_SCHEMA['properties'] as { items: { items: ObjectSchema } }).items;
  return items;
}
