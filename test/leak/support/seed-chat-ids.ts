export const A_ADMIN_MEMBERSHIP_ID = 'aaaaaaaa-0004-4000-8000-000000000001';
export const A_PENDING_CHANGES_ID = 'aaaaaaaa-0028-4000-8000-000000000001';
export const A_SCHEDULED_TASK_ID = 'aaaaaaaa-0029-4000-8000-000000000001';
export const A_ADMIN_SENDER = { channel: 'zalo-oa', accountId: 'seed-oa', externalUserId: 'seed-zalo-admin-a' };

export function buildAdminMessageId(turnNumber: number): string {
  return `aaaaaaaa-0020-4000-8000-0000000000f${turnNumber.toString(16)}`;
}

export function buildAdminEventKey(turnNumber: number): string {
  return `SAFE-A-ATTACK-EVENT-${turnNumber}`;
}
