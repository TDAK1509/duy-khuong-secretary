export function describeRenewalFailed(oaId: string, reason: string): string {
  return `[alert] Zalo key renewal failed for OA ${oaId} (${reason}). If it keeps failing, run connect-zalo again.`;
}

export function describeRenewalGotNoAnswer(oaId: string): string {
  return `[alert] Zalo key renewal got no answer for OA ${oaId}. Automatic renewal is stopped. Run connect-zalo again.`;
}

export function describeWebhookStoreFailed(errorName: string): string {
  return `[alert] Zalo webhook could not store an event: ${errorName}.`;
}
