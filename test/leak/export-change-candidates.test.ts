import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CellValue, CellSource, ValueType } from '../../src/app/documents/recorded-export.ts';
import { buildCandidates, type CandidateAction } from '../../src/app/export-reviews/build-change-candidates.ts';

const ENTRY_ID = 'aaaaaaaa-0014-4000-8000-0000000000e1';
const PAPER_ID = 'aaaaaaaa-0011-4000-8000-0000000000f1';
const NO_WHEN = { goods: null, pickup_company: null, dropoff_company: null, vehicle_plate: null };

test('a wage cell from an entry suggests a knowledge change', () => {
  const source: CellSource = { kind: 'entry', entry_id: ENTRY_ID, document_id: PAPER_ID, field: 'then_wage_vnd', snapshot: {} };
  assert.deepEqual(candidatesOf({ valueType: 'number', before: 600000, after: 700000, source }), [
    { cause: 'company_knowledge', change: { entry_id: ENTRY_ID, when: NO_WHEN, outcome: 'then_wage_vnd', value: 700000 } },
  ]);
});

test('a customer cell from an entry also allows a one-paper correction', () => {
  const source: CellSource = { kind: 'entry', entry_id: ENTRY_ID, document_id: PAPER_ID, field: 'then_customer', snapshot: {} };
  assert.deepEqual(candidatesOf({ valueType: 'text', before: 'Gamma', after: 'Delta', source }), [
    { cause: 'company_knowledge', change: { entry_id: ENTRY_ID, when: NO_WHEN, outcome: 'then_customer', value: 'Delta' } },
    { cause: 'paper_reading', change: { document_id: PAPER_ID, field: 'customer', value: 'Delta' } },
  ]);
});

test('a goods cell from a paper also allows standing knowledge', () => {
  const source: CellSource = { kind: 'paper', document_id: PAPER_ID, field: 'goods_line', snapshot: {} };
  assert.deepEqual(candidatesOf({ valueType: 'text', before: 'Than cám', after: 'Than đá', source }, 'Alpha'), [
    { cause: 'paper_reading', change: { document_id: PAPER_ID, field: 'goods', value: 'Than đá' } },
    { cause: 'company_knowledge', change: { entry_id: null, when: { ...NO_WHEN, goods: 'Than cám', pickup_company: 'Alpha' }, outcome: 'then_shown_goods_name', value: 'Than đá' } },
  ]);
});

test('a weight cell from a paper allows only a paper correction', () => {
  const source: CellSource = { kind: 'paper', document_id: PAPER_ID, field: 'weight_kg', snapshot: {} };
  assert.deepEqual(candidatesOf({ valueType: 'number', before: 27080, after: 27800, source }, 'Alpha'), [
    { cause: 'paper_reading', change: { document_id: PAPER_ID, field: 'weight', value: 27800 } },
  ]);
});

test('a freight amount that does not give a whole rate has no candidate', () => {
  const source: CellSource = { kind: 'computed', entry_id: ENTRY_ID, document_id: PAPER_ID, field: 'then_rate_vnd_per_ton', snapshot: { rate_vnd_per_ton: 150000, weight_kg: 27000 } };
  assert.deepEqual(candidatesOf({ valueType: 'number', before: 4050000, after: 4050001, source }), []);
});

test('a drop-off cell from an entry route condition allows only a paper correction', () => {
  const source: CellSource = { kind: 'entry', entry_id: ENTRY_ID, document_id: PAPER_ID, field: 'when_dropoff', snapshot: {} };
  assert.deepEqual(candidatesOf({ valueType: 'text', before: 'Beta', after: 'Gamma', source }), [
    { cause: 'paper_reading', change: { document_id: PAPER_ID, field: 'dropoff', value: 'Gamma' } },
  ]);
});

type Edit = { valueType: ValueType; before: CellValue; after: CellValue; source: CellSource };

function candidatesOf({ valueType, before, after, source }: Edit, pickupCompany: string | null = null): CandidateAction[] {
  const change = { columnKey: 'cell', valueType, before, after };
  return buildCandidates({ change, cell: { value_type: valueType, value: before, source }, pickupCompany });
}
