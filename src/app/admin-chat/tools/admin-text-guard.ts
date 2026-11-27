export const GUARDED_TOOLS = ['remove_member', 'create_invite', 'forget_all', 'forget_all_member_facts', 'rewrite_member_plate', 'save_document_template', 'delete_document'] as const;

export type GuardedTool = (typeof GUARDED_TOOLS)[number];

export const MEMBER_TEXT_TOOLS: readonly string[] = ['search_records', 'count_records', 'maintenance_status', 'list_document_numbers', 'total_document_numbers', 'list_organizations', 'list_merged_names', 'list_sources', 'list_documents', 'correct_document', 'total_fact_values', 'export_trip_report_xlsx', 'propose_document_templates'];

export const ADMIN_TEXT_TOOLS: readonly string[] = ['list_members', 'list_member_facts', 'list_scheduled_tasks', 'attach_photos', 'export_documents_xlsx', 'list_facts', 'export_report_xlsx', 'list_document_templates', 'list_rules', 'list_goods_names'];

export class AdminTextGuard {
  private otherTextSeen: boolean;

  constructor(otherTextAtStart: boolean) {
    this.otherTextSeen = otherTextAtStart;
  }

  noteCall(toolName: string): void {
    if (MEMBER_TEXT_TOOLS.includes(toolName)) this.otherTextSeen = true;
  }

  hasSeenOtherText(): boolean {
    return this.otherTextSeen;
  }
}

export function isGuardedTool(toolName: string): toolName is GuardedTool {
  return (GUARDED_TOOLS as readonly string[]).includes(toolName);
}
