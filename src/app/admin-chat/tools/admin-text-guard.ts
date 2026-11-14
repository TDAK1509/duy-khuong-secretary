export const CHANGE_TOOLS: readonly string[] = ['create_scheduled_task', 'cancel_scheduled_task', 'create_invite', 'remove_member', 'add_member_fact', 'forget_member_fact', 'forget_all_member_facts', 'remember', 'forget', 'forget_all', 'split_merged_name', 'rewrite_member_plate'];

export const MEMBER_TEXT_TOOLS: readonly string[] = ['search_records', 'count_records', 'maintenance_status', 'list_document_numbers', 'total_document_numbers', 'list_organizations', 'list_merged_names', 'list_sources', 'list_documents'];

export const ADMIN_TEXT_TOOLS: readonly string[] = ['list_members', 'list_member_facts', 'list_scheduled_tasks', 'attach_photos'];

export class AdminTextGuard {
  private otherTextSeen: boolean;
  private changeRefused = false;

  constructor(otherTextAtStart: boolean) {
    this.otherTextSeen = otherTextAtStart;
  }

  noteCall(toolName: string): void {
    if (MEMBER_TEXT_TOOLS.includes(toolName)) this.otherTextSeen = true;
  }

  refuses(toolName: string): boolean {
    const isRefused = CHANGE_TOOLS.includes(toolName) && this.otherTextSeen;
    if (isRefused) this.changeRefused = true;
    return isRefused;
  }

  hasSeenOtherText(): boolean {
    return this.otherTextSeen;
  }

  hasRefused(): boolean {
    return this.changeRefused;
  }
}
