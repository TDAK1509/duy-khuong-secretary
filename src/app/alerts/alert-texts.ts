export function describeRenewalFailed(oaId: string, reason: string): string {
  return `[alert] Zalo key renewal failed for OA ${oaId} (${reason}). If it keeps failing, run connect-zalo again.`;
}

export function describeRenewalGotNoAnswer(oaId: string): string {
  return `[alert] Zalo key renewal got no answer for OA ${oaId}. Automatic renewal is stopped. Run connect-zalo again.`;
}

export function describeWebhookStoreFailed(errorName: string): string {
  return `[alert] Zalo webhook could not store an event: ${errorName}.`;
}

export function describeInboundEventFailed(eventId: string, attempts: number, errorName: string): string {
  return `[alert] Inbound event ${eventId} failed after ${attempts} attempts: ${errorName}.`;
}

export function describeOutboundMessageFailed(outboundId: string, attempts: number): string {
  return `[alert] Outbound message ${outboundId} failed after ${attempts} attempts.`;
}

export function describeSendGotNoAnswer(outboundId: string): string {
  return `[alert] Zalo send got no answer for outbound message ${outboundId}. It will not be resent. Check the chat in OA Manager.`;
}

export function describeNoConnection(oaId: string): string {
  return `[alert] No Zalo connection for OA ${oaId}. Run connect-zalo.`;
}
