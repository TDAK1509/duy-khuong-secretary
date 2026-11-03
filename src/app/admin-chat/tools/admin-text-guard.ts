export const CHANGE_TOOLS: readonly string[] = ['create_scheduled_task', 'cancel_scheduled_task', 'create_invite', 'remove_member'];

export const MEMBER_TEXT_TOOLS: readonly string[] = ['search_records', 'maintenance_status'];

export const ADMIN_TEXT_TOOLS: readonly string[] = ['count_records', 'list_members', 'list_scheduled_tasks', 'attach_photos'];

export class AdminTextGuard {
  private otherTextSeen: boolean;

  constructor(otherTextAtStart: boolean) {
    this.otherTextSeen = otherTextAtStart;
  }

  noteCall(toolName: string): void {
    if (MEMBER_TEXT_TOOLS.includes(toolName)) this.otherTextSeen = true;
  }

  refuses(toolName: string): boolean {
    return CHANGE_TOOLS.includes(toolName) && this.otherTextSeen;
  }
}
