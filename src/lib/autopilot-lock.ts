// Shared in-flight lock so the auto-pilot fires at most once per conversation,
// no matter how many surfaces are polling (dashboard shell poller, open thread).
export const autoPilotInFlight = new Set<string>();

export function acquireAutoPilot(conversationId: string): boolean {
  if (autoPilotInFlight.has(conversationId)) return false;
  autoPilotInFlight.add(conversationId);
  return true;
}

export function releaseAutoPilot(conversationId: string): void {
  autoPilotInFlight.delete(conversationId);
}
