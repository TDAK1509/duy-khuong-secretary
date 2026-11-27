import type { AttackCase } from './attack-case.ts';
import { A_DRIVER_MEMBER_ID, B_DOCUMENT_ID, B_FACT_ID, B_MEMBER_ID, B_RULE_ID, B_SCHEDULED_TASK_ID, SHARED_COMPANY, SHARED_DOCUMENT_NUMBER, SHARED_PLATE } from './seed-ids.ts';

const AIMED_VALUE = { name: 'Lương', number: 1, unit: 'đ', text: null };

export const CHANGE_ATTACK_CASES: AttackCase[] = [
  { name: 'create_invite', kind: 'change', arguments: { display_name: 'TARGET-B-INVITEE', role: 'admin' } },
  { name: 'remove_member', kind: 'change', arguments: { member_id: B_MEMBER_ID } },
  { name: 'add_member_fact', kind: 'change', arguments: { member_id: A_DRIVER_MEMBER_ID, fact: 'TARGET-B-FACT', readers: 'admins' }, alsoAimedAt: [{ member_id: B_MEMBER_ID, fact: 'TARGET-B-FACT', readers: 'admins' }] },
  { name: 'forget_member_fact', kind: 'change', arguments: { member_id: A_DRIVER_MEMBER_ID, fact: 'SHARED-MEMBER-FACT' }, alsoAimedAt: [{ member_id: B_MEMBER_ID, fact: 'SHARED-MEMBER-FACT' }] },
  { name: 'forget_all_member_facts', kind: 'change', arguments: { member_id: A_DRIVER_MEMBER_ID }, alsoAimedAt: [{ member_id: B_MEMBER_ID }] },
  { name: 'rewrite_member_plate', kind: 'change', arguments: { member_id: B_MEMBER_ID, vehicle_plate: '99Z54321' } },
  {
    name: 'correct_document',
    kind: 'change',
    arguments: {
      new_plate: '99Z54321', new_number: null, new_date: '2026-03-02', new_stage: null, printed_label: null, printed_value: null, printed_meaning: null, printed_number: null, printed_unit: null,
      company_slot: null, company_name: null, last_photo: false, current_plate: SHARED_PLATE, current_number: SHARED_DOCUMENT_NUMBER, current_date: null, all_matching: true,
    },
  },
  { name: 'delete_document', kind: 'change', arguments: { document_ids: [B_DOCUMENT_ID] } },
  { name: 'save_fact', kind: 'change', arguments: { statement: 'TARGET-B-FACT lương 1đ', vehicle_plate: SHARED_PLATE, driver_member_id: null, pickup_company: SHARED_COMPANY, dropoff_company: null, customer_company: null, values: [AIMED_VALUE], fact_id: null } },
  { name: 'update_fact', kind: 'change', arguments: { fact_id: B_FACT_ID, change_statement: 'TARGET-B-FACT lương 1đ', set_values: [AIMED_VALUE], remove_values: [], vehicle_plate: null, driver_member_id: null, clear_scope: [] } },
  { name: 'delete_fact', kind: 'change', arguments: { fact_id: B_FACT_ID } },
  { name: 'save_rule', kind: 'change', arguments: {} },
  { name: 'delete_rule', kind: 'change', arguments: { rule_id: B_RULE_ID } },
  { name: 'join_goods_names', kind: 'change', arguments: { written_names: ['TARGET-B-GOODS-ONLY'], shown_name: 'TARGET-B-GOODS' } },
  { name: 'remove_goods_name', kind: 'change', arguments: { written_name: 'SHARED-GOODS' } },
  { name: 'save_document_template', kind: 'change', arguments: { name: 'TARGET-B-TEMPLATE-ONLY', kind: 'phiếu cân', issuer_company: SHARED_COMPANY, stage: 'dispatch', description: 'TARGET-B-TEMPLATE', fields: [] } },
  { name: 'delete_document_template', kind: 'change', arguments: { name: 'TARGET-B-TEMPLATE-ONLY' } },
  { name: 'create_scheduled_task', kind: 'change', arguments: { title: 'TARGET-B-TASK', instruction: 'TARGET-B-WORKSPACE', repeat: 'daily', run_once_at: null, time_of_day: '09:00', weekday: null, day_of_month: null } },
  { name: 'cancel_scheduled_task', kind: 'change', arguments: { task_id: B_SCHEDULED_TASK_ID } },
  { name: 'split_merged_name', kind: 'change', arguments: { printed_name: 'SHARED-ALIAS' } },
  { name: 'remember', kind: 'change', arguments: { fact: 'TARGET-B-MEMORY' } },
  { name: 'forget', kind: 'change', arguments: { fact: 'SHARED-MEMORY' } },
  { name: 'forget_all', kind: 'change', arguments: {} },
];
