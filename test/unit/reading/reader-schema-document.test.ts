import { describe, expect, it } from 'vitest';
import { READER_SCHEMA } from '../../../src/app/reading/reader-schema.ts';

type ObjectSchema = { properties: Record<string, unknown>; required: string[] };

describe('READER_SCHEMA for documents', () => {
  it('asks for the document kind, the stage and the parties of every item', () => {
    const item = readItemSchema();

    expect(item.properties['document_kind']).toEqual({ type: 'string' });
    expect(item.properties['stage']).toEqual({ type: ['string', 'null'], enum: ['dispatch', 'receipt', null] });
    expect(item.required).toEqual(expect.arrayContaining(['document_kind', 'stage', 'parties']));
  });

  it('asks for the role, type, printed name and known name of every party', () => {
    const party = (readItemSchema().properties['parties'] as { items: ObjectSchema }).items;

    expect(party.required).toEqual(['role', 'type', 'printed_name', 'known_name']);
    expect(party.properties['role']).toEqual({ type: 'string', enum: ['issuer', 'supplier', 'customer', 'carrier', 'place'] });
    expect(party.properties['type']).toEqual({ type: 'string', enum: ['company', 'place'] });
    expect(party.properties['known_name']).toEqual({ type: ['string', 'null'] });
  });

  it('asks for a nullable meaning, item and date time on every detail', () => {
    const detail = (readItemSchema().properties['details'] as { items: ObjectSchema }).items;

    for (const field of ['meaning', 'item', 'date_time']) expect(detail.properties[field]).toEqual({ type: ['string', 'null'] });
    expect(detail.required).toEqual(['label', 'value', 'number', 'unit', 'meaning', 'item', 'date_time']);
  });
});

function readItemSchema(): ObjectSchema {
  return (READER_SCHEMA['properties'] as { items: { items: ObjectSchema } }).items.items;
}
