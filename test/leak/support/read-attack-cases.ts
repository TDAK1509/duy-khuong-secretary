import type { AttackCase } from './attack-case.ts';
import { SHARED_PLATE_FILTER } from './document-filter.ts';
import { A_DRIVER_MEMBER_ID, B_DOCUMENT_ID, B_MEMBER_ID, B_ONLY_DOCUMENT_ID, B_PHOTO_MESSAGE_ID, B_RECORD_ID, SHARED_PLATE } from './seed-ids.ts';

const SHARED_MEANING = 'SHARED-MEANING';

export const READ_ATTACK_CASES: AttackCase[] = [
  { name: 'search_records', kind: 'read', arguments: { text: 'TARGET-B-WORKSPACE', category: null, member: null, plate: SHARED_PLATE, added_from: null, added_to: null, cursor: null } },
  { name: 'count_records', kind: 'read', arguments: { added_from: '2026-01-01', added_to: '2026-12-31' } },
  { name: 'list_members', kind: 'read', arguments: {} },
  { name: 'list_member_facts', kind: 'read', arguments: { member_id: A_DRIVER_MEMBER_ID }, alsoAimedAt: [{ member_id: B_MEMBER_ID }] },
  { name: 'list_facts', kind: 'read', arguments: { vehicle_plate: SHARED_PLATE, driver_member_id: null, company: null } },
  { name: 'total_fact_values', kind: 'read', arguments: { value_name: 'Lương', ...SHARED_PLATE_FILTER, group_by: 'none' } },
  { name: 'list_rules', kind: 'read', arguments: {} },
  { name: 'list_goods_names', kind: 'read', arguments: {} },
  { name: 'propose_document_templates', kind: 'read', arguments: { paper_id: null }, alsoAimedAt: [{ paper_id: B_ONLY_DOCUMENT_ID }] },
  { name: 'list_document_templates', kind: 'read', arguments: {} },
  { name: 'maintenance_status', kind: 'read', arguments: { plate: SHARED_PLATE, maintenance_item: null, cursor: null } },
  { name: 'attach_photos', kind: 'read', arguments: { record_ids: [B_RECORD_ID], document_ids: [B_DOCUMENT_ID] } },
  { name: 'list_sources', kind: 'read', arguments: { record_ids: [B_RECORD_ID, B_PHOTO_MESSAGE_ID], document_ids: [B_DOCUMENT_ID] } },
  { name: 'list_scheduled_tasks', kind: 'read', arguments: { scope: 'all' } },
  { name: 'list_merged_names', kind: 'read', arguments: { text: null } },
  { name: 'list_document_numbers', kind: 'read', arguments: SHARED_PLATE_FILTER },
  { name: 'total_document_numbers', kind: 'read', arguments: { meaning: SHARED_MEANING, lines: 'document', ...SHARED_PLATE_FILTER, group_by: 'none' } },
  { name: 'list_organizations', kind: 'read', arguments: { text: null, cursor: null } },
  { name: 'list_documents', kind: 'read', arguments: { meaning: SHARED_MEANING, lines: 'document', ...SHARED_PLATE_FILTER, cursor: null } },
  { name: 'export_documents_xlsx', kind: 'read', arguments: SHARED_PLATE_FILTER },
  { name: 'export_report_xlsx', kind: 'read', arguments: { title: 'TARGET-B-WORKSPACE', columns: [{ name: 'Tên', type: 'text', unit: null }], rows: [['TARGET-B-WORKSPACE']], layout: null } },
  { name: 'export_trip_report_xlsx', kind: 'read', arguments: { title: 'TARGET-B-WORKSPACE', date_from: '2026-01-01', date_to: '2026-03-31', plate: SHARED_PLATE, columns: [{ name: 'Biển số', source: 'field', field: 'plate', value_name: null }, { name: 'Lương', source: 'fact_value', field: null, value_name: 'Lương' }, { name: 'Người gửi', source: 'field', field: 'sender', value_name: null }], layout: null } },
];
