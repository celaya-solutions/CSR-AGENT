/**
 * There is no built-in endpoint: this build ships without a vendor telemetry or
 * update-check service, so nothing is sent until an operator points
 * OPENCLAW_TELEMETRY_ENDPOINT at a server they run.
 */
export function resolveTelemetryEndpoint(): string | undefined {
  return process.env.OPENCLAW_TELEMETRY_ENDPOINT?.trim() || undefined;
}
