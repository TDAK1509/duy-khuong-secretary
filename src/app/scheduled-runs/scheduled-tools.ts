import type { ToolSpec } from '../../services/chat/chat-service.ts';
import {
  COUNT_RECORDS_SPEC,
  LIST_MEMBERS_SPEC,
  MAINTENANCE_STATUS_SPEC,
  SEARCH_RECORDS_SPEC,
} from '../admin-chat/tools/tool-specs.ts';

export const SCHEDULED_RUN_TOOLS: ToolSpec[] = [
  SEARCH_RECORDS_SPEC,
  COUNT_RECORDS_SPEC,
  MAINTENANCE_STATUS_SPEC,
  LIST_MEMBERS_SPEC,
];
