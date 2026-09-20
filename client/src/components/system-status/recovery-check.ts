import { readApiJsonPayload } from "@/lib/api/contract";

export type RecoveryResult = "restored" | "maintenance" | "unavailable";
const JSON_LIMITS = { maxDepth: 8, maxNodes: 100, maxRawLength: 16_384, maxStringLength: 4_096 };

/** Manual, cheap checks only. Liveness HTTP 200 alone is not proof of recovery. */
export async function checkServiceRecovery(signal: AbortSignal): Promise<RecoveryResult> {
  const options: RequestInit = { signal, cache: "no-store", credentials: "same-origin",
    headers: { Accept: "application/json" }, redirect: "error" };
  const live = await fetch("/api/health/live", options);
  if (!live.ok || !live.headers.get("Content-Type")?.includes("application/json")) return "unavailable";
  const health = await readApiJsonPayload(live, "/api/health/live", JSON_LIMITS);
  if (!health || typeof health !== "object" || !("ready" in health) || health.ready !== true) return "unavailable";
  const response = await fetch("/api/maintenance-status", options);
  if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) return "unavailable";
  const maintenance = await readApiJsonPayload(response, "/api/maintenance-status", JSON_LIMITS);
  if (!maintenance || typeof maintenance !== "object" || !("maintenance" in maintenance)) return "unavailable";
  return maintenance.maintenance === false ? "restored" : maintenance.maintenance === true ? "maintenance" : "unavailable";
}
