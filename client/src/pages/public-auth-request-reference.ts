import { normalizeToastRequestId } from "@/components/ui/toast-request-reference";
import { safeJsonParseResult } from "@/lib/utils/safe-json";

function ownValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function readReference(value: unknown): string | null {
  const direct = ownValue(value, "requestId");
  if (typeof direct === "string") {
    const reference = normalizeToastRequestId(direct);
    if (reference) return reference;
  }
  const nested = ownValue(ownValue(value, "error"), "requestId");
  return typeof nested === "string" ? normalizeToastRequestId(nested) : null;
}

/** Extract only server support metadata; never return a diagnostic, URL or token. */
export function getPublicAuthRequestReference(error: unknown): string | null {
  try {
    const message = ownValue(error, "message");
    const directStatus = ownValue(error, "status");
    const status = typeof directStatus === "number" ? directStatus
      : typeof message === "string" ? Number(/^(\d{3}):\s*/.exec(message)?.[1]) : NaN;
    if (!Number.isInteger(status) || status < 500 || status > 599) return null;
    const direct = readReference(error);
    if (direct) return direct;
    if (typeof message !== "string") return null;
    const parsed = safeJsonParseResult<unknown>(message.replace(/^\d{3}:\s*/, ""), {
      maxRawLength: 64_000,
      maxDepth: 12,
      maxNodes: 1000,
    });
    return parsed.ok ? readReference(parsed.data) : null;
  } catch {
    return null;
  }
}
