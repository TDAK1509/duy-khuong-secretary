import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import { LIST_DOCUMENT_NUMBERS_SPEC, LIST_DOCUMENTS_SPEC, LIST_ORGANIZATIONS_SPEC, TOTAL_DOCUMENT_NUMBERS_SPEC } from './document-number-specs.ts';
import { LIST_MERGED_NAMES_SPEC, SPLIT_MERGED_NAME_SPEC } from './merged-name-specs.ts';
import { MEMBER_FACT_TOOLS } from './member-fact-specs.ts';
import { ADMIN_SEARCH_RECORDS_SPEC } from './admin-search-records-spec.ts';
import { ADMIN_ATTACH_PHOTOS_SPEC, ADMIN_LIST_SOURCES_SPEC } from './admin-source-specs.ts';
import { REWRITE_MEMBER_PLATE_SPEC } from './rewrite-member-plate-spec.ts';
import { CORRECT_DOCUMENT_SPEC } from './correct-document-spec.ts';
import { EXPORT_DOCUMENTS_XLSX_SPEC } from './export-documents-xlsx-spec.ts';
import { EXPORT_REPORT_XLSX_SPEC } from './export-report-xlsx-spec.ts';
import { EXPORT_TRIP_REPORT_XLSX_SPEC } from './export-trip-report-xlsx-spec.ts';
import { SAVE_FACT_SPEC } from './save-fact-spec.ts';
import { LIST_FACTS_SPEC } from './list-facts-spec.ts';
import { UPDATE_FACT_SPEC } from './update-fact-spec.ts';
import { DELETE_FACT_SPEC } from './delete-fact-spec.ts';
import { TOTAL_FACT_VALUES_SPEC } from './total-fact-values-spec.ts';
import { WORKSPACE_RULE_TOOLS } from './workspace-rule-specs.ts';
import { GOODS_NAME_TOOLS } from './goods-name-specs.ts';
import { DOCUMENT_TEMPLATE_TOOLS } from './document-template-specs.ts';
import {
  CANCEL_SCHEDULED_TASK_SPEC,
  COUNT_RECORDS_SPEC,
  CREATE_INVITE_SPEC,
  LIST_MEMBERS_SPEC,
  LIST_SCHEDULED_TASKS_SPEC,
  MAINTENANCE_STATUS_SPEC,
  CREATE_SCHEDULED_TASK_SPEC,
  REMOVE_MEMBER_SPEC,
} from './tool-specs.ts';

export const ADMIN_TOOLS: ToolSpec[] = [
  ADMIN_SEARCH_RECORDS_SPEC,
  COUNT_RECORDS_SPEC,
  LIST_MEMBERS_SPEC,
  CREATE_INVITE_SPEC,
  REMOVE_MEMBER_SPEC,
  ...MEMBER_FACT_TOOLS,
  REWRITE_MEMBER_PLATE_SPEC,
  CORRECT_DOCUMENT_SPEC,
  SAVE_FACT_SPEC,
  LIST_FACTS_SPEC,
  UPDATE_FACT_SPEC,
  DELETE_FACT_SPEC,
  TOTAL_FACT_VALUES_SPEC,
  ...WORKSPACE_RULE_TOOLS,
  ...GOODS_NAME_TOOLS,
  ...DOCUMENT_TEMPLATE_TOOLS,
  MAINTENANCE_STATUS_SPEC,
  ADMIN_ATTACH_PHOTOS_SPEC,
  ADMIN_LIST_SOURCES_SPEC,
  CREATE_SCHEDULED_TASK_SPEC,
  LIST_SCHEDULED_TASKS_SPEC,
  CANCEL_SCHEDULED_TASK_SPEC,
  LIST_MERGED_NAMES_SPEC,
  SPLIT_MERGED_NAME_SPEC,
  LIST_DOCUMENT_NUMBERS_SPEC,
  TOTAL_DOCUMENT_NUMBERS_SPEC,
  LIST_ORGANIZATIONS_SPEC,
  LIST_DOCUMENTS_SPEC,
  EXPORT_DOCUMENTS_XLSX_SPEC,
  EXPORT_REPORT_XLSX_SPEC,
  EXPORT_TRIP_REPORT_XLSX_SPEC,
];
