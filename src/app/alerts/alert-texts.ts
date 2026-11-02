export function describeRenewalFailed(oaId: string, reason: string): string {
  return `[alert] Zalo key renewal failed for OA ${oaId} (${reason}). If it keeps failing, run connect-zalo again.`;
}
