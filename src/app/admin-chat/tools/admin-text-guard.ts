export const CHANGE_TOOLS = ['create_scheduled_task', 'cancel_scheduled_task', 'create_invite', 'remove_member', 'add_member_fact', 'forget_member_fact', 'forget_all_member_facts', 'remember', 'forget', 'forget_all', 'split_merged_name', 'rewrite_member_plate', 'save_fact', 'update_fact', 'delete_fact'] as const;

export type ChangeTool = (typeof CHANGE_TOOLS)[number];

export const MEMBER_TEXT_TOOLS: readonly string[] = ['search_records', 'count_records', 'maintenance_status', 'list_document_numbers', 'total_document_numbers', 'list_organizations', 'list_merged_names', 'list_sources', 'list_documents'];

export const ADMIN_TEXT_TOOLS: readonly string[] = ['list_members', 'list_member_facts', 'list_scheduled_tasks', 'attach_photos', 'export_documents_xlsx', 'list_facts'];

export class AdminTextGuard {
  private otherTextSeen: boolean;
  private readonly refusedTools: ChangeTool[] = [];

  constructor(otherTextAtStart: boolean) {
    this.otherTextSeen = otherTextAtStart;
  }

  noteCall(toolName: string): void {
    if (MEMBER_TEXT_TOOLS.includes(toolName)) this.otherTextSeen = true;
  }

  refuses(toolName: string): boolean {
    if (!isChangeTool(toolName) || !this.otherTextSeen) return false;
    if (!this.refusedTools.includes(toolName)) this.refusedTools.push(toolName);
    return true;
  }

  hasSeenOtherText(): boolean {
    return this.otherTextSeen;
  }

  listRefusedTools(): ChangeTool[] {
    return [...this.refusedTools];
  }
}

function isChangeTool(toolName: string): toolName is ChangeTool {
  return (CHANGE_TOOLS as readonly string[]).includes(toolName);
}
