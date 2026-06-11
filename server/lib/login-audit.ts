import {
  buildSecurityAuditDetails,
  type SecurityAuditEventType,
  type SecurityAuditMetadata,
  type SecurityAuditOutcome,
} from "./security-audit-log";
import { getRequestContext } from "./request-context";
import { parsePlatform, summarizeUserAgent } from "./browser";

function maskLoginAuditNetwork(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const ipv4Parts = normalized.split(".");
  if (
    ipv4Parts.length === 4
    && ipv4Parts.every((part) => /^\d{1,3}$/.test(part))
  ) {
    const octets = ipv4Parts.map(Number);
    if (octets.every((octet) => octet >= 0 && octet <= 255)) {
      return `${octets[0]}.${octets[1]}.x.x`;
    }
  }

  if (normalized.includes(":")) {
    const segments = normalized.split(":").filter(Boolean);
    if (
      segments.length >= 2
      && segments.every((segment) => /^[a-f0-9]{1,4}$/i.test(segment))
    ) {
      return `${segments[0]}:${segments[1]}:...`;
    }
    return "IPv6";
  }

  return "Unknown";
}

export function buildLoginFailureAuditDetails(params: {
  actorId?: string | null | undefined;
  browserName: string;
  event?: Extract<SecurityAuditEventType, "AUTH_2FA_FAILURE" | "AUTH_LOGIN_FAILURE"> | undefined;
  failureReason: string;
  ipAddress?: string | null | undefined;
  message: string;
  metadata?: SecurityAuditMetadata | undefined;
  outcome?: Exclude<SecurityAuditOutcome, "success"> | undefined;
  role?: string | null | undefined;
}): string {
  const requestContext = getRequestContext();
  const userAgent = requestContext?.userAgent ?? params.browserName;

  return buildSecurityAuditDetails({
    event: params.event ?? "AUTH_LOGIN_FAILURE",
    outcome: params.outcome ?? "failure",
    actorId: params.actorId,
    ipAddress: params.ipAddress ?? requestContext?.clientIp,
    userAgent,
    metadata: {
      ...params.metadata,
      browser: params.browserName,
      failure_reason: params.failureReason,
      network: maskLoginAuditNetwork(params.ipAddress ?? requestContext?.clientIp),
      platform: parsePlatform(userAgent),
      role: params.role ?? "unknown",
      user_agent_summary: summarizeUserAgent(userAgent),
    },
    message: params.message,
  });
}
