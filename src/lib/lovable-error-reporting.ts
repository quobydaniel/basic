// In the Lovable original, errors were forwarded to the Lovable in-browser
// event channel (`window.__lovableEvents`). BASIC's rebuild doesn't run on
// Lovable, so this is a console-only stub that keeps the same exported API
// surface (`reportLovableError`) so callers don't need to change and a real
// tracker (Sentry, etc.) can drop in later.

export function reportLovableError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  // Avoid hammering the console if a boundary keeps firing.
  if ((window as unknown as { __sellioLastReportedAt?: number }).__sellioLastReportedAt && Date.now() - (window as unknown as { __sellioLastReportedAt: number }).__sellioLastReportedAt < 2000) return;
  (window as unknown as { __sellioLastReportedAt?: number }).__sellioLastReportedAt = Date.now();
  // eslint-disable-next-line no-console
  console.error("[sellio] uncaught error", error, context);
}
