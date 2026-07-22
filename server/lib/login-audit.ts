import {
  buildSecurityAuditDetails,
  type SecurityAuditEventType,
  type SecurityAuditMetadata,
  type SecurityAuditOutcome,
} from "./security-audit-log";
import { normalizeClientIpAddress } from "../http/client-ip";
import { getRequestContext } from "./request-context";
import { parsePlatform, summarizeUserAgent } from "./browser";

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
  const ipAddress = normalizeClientIpAddress(
    params.ipAddress ?? requestContext?.clientIp,
  );

  return buildSecurityAuditDetails({
    event: params.event ?? "AUTH_LOGIN_FAILURE",
    outcome: params.outcome ?? "failure",
    actorId: params.actorId,
    ipAddress,
    userAgent,
    metadata: {
      ...params.metadata,
      browser: params.browserName,
      failure_reason: params.failureReason,
      network: ipAddress,
      platform: parsePlatform(userAgent),
      role: params.role ?? "unknown",
      user_agent_summary: summarizeUserAgent(userAgent),
    },
    message: params.message,
  });
}
