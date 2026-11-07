export const CHANGE_TOOLS: readonly string[] = ['create_scheduled_task', 'cancel_scheduled_task', 'create_invite', 'remove_member'];

export const MEMBER_TEXT_TOOLS: readonly string[] = ['search_records', 'maintenance_status', 'total_numbers'];

export const ADMIN_TEXT_TOOLS: readonly string[] = ['count_records', 'list_members', 'list_scheduled_tasks', 'attach_photos'];

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

  hasRefused(): boolean {
    return this.changeRefused;
  }
}
