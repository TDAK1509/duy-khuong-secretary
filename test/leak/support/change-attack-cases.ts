import type { AttackCase } from './attack-case.ts';
import { A_DRIVER_MEMBER_ID, B_DOCUMENT_ID, B_ENTRY_ID, B_MEMBER_ID, B_SCHEDULED_TASK_ID, SHARED_COMPANY, SHARED_DOCUMENT_NUMBER, SHARED_PLATE } from './seed-ids.ts';

const AIMED_KNOWLEDGE = {
  statement: 'TARGET-B-FACT lương 1đ',
  when_goods: null,
  when_pickup_company: SHARED_COMPANY,
  when_dropoff_company: null,
  when_vehicle_plate: SHARED_PLATE,
  when_driver_member_id: null,
  then_customer: null,
  then_dropoff: null,
  then_shown_goods: null,
  then_wage_vnd: 1,
  then_rate_vnd_per_ton: null,
  then_allowance_vnd: null,
  then_equal_weights: false,
  then_note: null,
};

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
  { name: 'save_company_knowledge', kind: 'change', arguments: { ...AIMED_KNOWLEDGE, entry_id: null } },
  { name: 'update_company_knowledge', kind: 'change', arguments: { ...AIMED_KNOWLEDGE, entry_id: B_ENTRY_ID } },
  { name: 'delete_company_knowledge', kind: 'change', arguments: { entry_id: B_ENTRY_ID } },
  { name: 'save_document_template', kind: 'change', arguments: { name: 'TARGET-B-TEMPLATE-ONLY', kind: 'phiếu cân', issuer_company: SHARED_COMPANY, stage: 'dispatch', description: 'TARGET-B-TEMPLATE', fields: [], example_paper_ids: [B_DOCUMENT_ID] } },
  { name: 'delete_document_template', kind: 'change', arguments: { name: 'TARGET-B-TEMPLATE-ONLY' } },
  { name: 'create_scheduled_task', kind: 'change', arguments: { title: 'TARGET-B-TASK', instruction: 'TARGET-B-WORKSPACE', repeat: 'daily', run_once_at: null, time_of_day: '09:00', weekday: null, day_of_month: null } },
  { name: 'cancel_scheduled_task', kind: 'change', arguments: { task_id: B_SCHEDULED_TASK_ID } },
  { name: 'split_merged_name', kind: 'change', arguments: { printed_name: 'SHARED-ALIAS' } },
  { name: 'remember', kind: 'change', arguments: { fact: 'TARGET-B-MEMORY' } },
  { name: 'forget', kind: 'change', arguments: { fact: 'SHARED-MEMORY' } },
  { name: 'forget_all', kind: 'change', arguments: {} },
];
