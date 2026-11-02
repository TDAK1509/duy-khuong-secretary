import type { ToolSpec } from '../../../services/chat/chat-service.ts';
import {
  COUNT_RECORDS_SPEC,
  CREATE_INVITE_SPEC,
  LIST_MEMBERS_SPEC,
  REMOVE_MEMBER_SPEC,
  SEARCH_RECORDS_SPEC,
} from './tool-specs.ts';

export const ADMIN_TOOLS: ToolSpec[] = [
  SEARCH_RECORDS_SPEC,
  COUNT_RECORDS_SPEC,
  LIST_MEMBERS_SPEC,
  CREATE_INVITE_SPEC,
  REMOVE_MEMBER_SPEC,
];
