import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import { logger } from "../lib/logger";
import {
  MAX_RUNTIME_WS_MESSAGE_BYTES,
  type RuntimeForwardedHeaderTrustOptions,
  type RuntimeOriginValidationReason,
  type RuntimeOriginValidationResult,
  type RuntimeTrustedForwardedProxyMatcher,
  type RuntimeWebSocketActivity,
  type RuntimeWebSocketErrorLike,
} from "./ws-runtime-types";

export function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }
  return String(value || "");
}

function firstForwardedValue(value: string | string[] | undefined): string {
  return firstHeaderValue(value).split(",")[0]?.trim() || "";
}

function normalizeSocketAddress(value: string | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const zoneLess = trimmed.split("%")[0] || "";
  const ipv4MappedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(zoneLess);
  return (ipv4MappedMatch?.[1] || zoneLess).toLowerCase();
}

export function buildTrustedProxyMatcher(
  trustedProxies: readonly string[],
): RuntimeTrustedForwardedProxyMatcher {
  if (trustedProxies.length === 0) {
    return null;
  }

  const blockList = new BlockList();
  const exactAddresses = new Set<string>();

  const addSubnet = (address: string, prefix: number) => {
    const normalizedAddress = normalizeSocketAddress(address);
    const family = isIP(normalizedAddress);
    if (!family) {
      return;
    }
    blockList.addSubnet(normalizedAddress, prefix, family === 4 ? "ipv4" : "ipv6");
  };

  const addAddress = (address: string) => {
    const normalizedAddress = normalizeSocketAddress(address);
    if (!isIP(normalizedAddress)) {
      return;
    }
    exactAddresses.add(normalizedAddress);
  };

  for (const entry of trustedProxies) {
    const normalizedEntry = String(entry || "").trim().toLowerCase();
    if (!normalizedEntry) {
      continue;
    }

    if (normalizedEntry === "loopback") {
      addSubnet("127.0.0.0", 8);
      addAddress("::1");
      continue;
    }

    if (normalizedEntry === "linklocal") {
      addSubnet("169.254.0.0", 16);
      addSubnet("fe80::", 10);
      continue;
    }

    if (normalizedEntry === "uniquelocal") {
      addSubnet("10.0.0.0", 8);
      addSubnet("172.16.0.0", 12);
      addSubnet("192.168.0.0", 16);
      addSubnet("fc00::", 7);
      continue;
    }

    const slashIndex = normalizedEntry.lastIndexOf("/");
    if (slashIndex > 0) {
      const candidateAddress = normalizeSocketAddress(normalizedEntry.slice(0, slashIndex));
      const prefix = Number.parseInt(normalizedEntry.slice(slashIndex + 1), 10);
      if (Number.isFinite(prefix) && isIP(candidateAddress)) {
        addSubnet(candidateAddress, prefix);
        continue;
      }
    }

    addAddress(normalizedEntry);
  }

  return (remoteAddress: string) => {
    const normalizedAddress = normalizeSocketAddress(remoteAddress);
    const family = isIP(normalizedAddress);
    if (!family) {
      return false;
    }

    return exactAddresses.has(normalizedAddress)
      || blockList.check(normalizedAddress, family === 4 ? "ipv4" : "ipv6");
  };
}

export function shouldTrustForwardedHeaders(
  req: Pick<IncomingMessage, "socket">,
  options: RuntimeForwardedHeaderTrustOptions,
  matcher: RuntimeTrustedForwardedProxyMatcher,
): boolean {
  if (!options.trustForwardedHeaders) {
    return false;
  }

  if (!matcher) {
    return true;
  }

  return matcher(normalizeSocketAddress(req.socket?.remoteAddress));
}

export function readWebSocketRequestHost(
  headers: IncomingHttpHeaders,
  options: { trustForwardedHeaders: boolean },
): string {
  const trustedForwardedHost = options.trustForwardedHeaders
    ? firstForwardedValue(headers["x-forwarded-host"])
    : "";
  return (trustedForwardedHost || firstHeaderValue(headers.host))
    .trim()
    .toLowerCase();
}

export function readWebSocketRequestProto(
  req: Pick<IncomingMessage, "headers" | "socket">,
  options: { trustForwardedHeaders: boolean },
): string {
  const forwardedProto = options.trustForwardedHeaders
    ? firstForwardedValue(req.headers["x-forwarded-proto"]).toLowerCase()
    : "";
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  return req.socket && "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";
}

export function validateSameOriginWebSocketRequest(
  req: Pick<IncomingMessage, "headers" | "socket">,
  options: { trustForwardedHeaders: boolean },
): RuntimeOriginValidationResult {
  const origin = firstHeaderValue(req.headers.origin).trim();
  if (!origin) {
    return {
      ok: false,
      reason: "missing_origin",
    };
  }

  const requestHost = readWebSocketRequestHost(req.headers, options);
  if (!requestHost) {
    return {
      ok: false,
      reason: "missing_request_host",
    };
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") {
      return {
        ok: false,
        reason: "unsupported_origin_protocol",
      };
    }

    if (originUrl.host.toLowerCase() !== requestHost) {
      return {
        ok: false,
        reason: "host_mismatch",
      };
    }

    const requestProto = readWebSocketRequestProto(req, options);
    if (originUrl.protocol !== `${requestProto}:`) {
      return {
        ok: false,
        reason: "protocol_mismatch",
      };
    }

    return {
      ok: true,
    };
  } catch {
    return {
      ok: false,
      reason: "invalid_origin",
    };
  }
}

export function buildWebSocketHandshakeLogDetails(params: {
  req: Pick<IncomingMessage, "headers" | "socket">;
  trustForwardedHeaders: boolean;
  trustedForwardedProxyMatcher: RuntimeTrustedForwardedProxyMatcher;
  rejectionReason: RuntimeOriginValidationReason | "query_token";
}) {
  const forwardedHeadersTrusted = shouldTrustForwardedHeaders(
    params.req,
    {
      trustForwardedHeaders: params.trustForwardedHeaders,
      trustedForwardedProxies: [],
    },
    params.trustedForwardedProxyMatcher,
  );
  const origin = firstHeaderValue(params.req.headers.origin).trim();
  const originProtocol = origin
    ? (() => {
        try {
          return new URL(origin).protocol.replace(/:$/, "");
        } catch {
          return "invalid";
        }
      })()
    : "missing";

  return {
    rejectionReason: params.rejectionReason,
    originPresent: origin.length > 0,
    originProtocol,
    requestHostPresent: readWebSocketRequestHost(params.req.headers, {
      trustForwardedHeaders: forwardedHeadersTrusted,
    }).length > 0,
    requestProto: readWebSocketRequestProto(params.req, {
      trustForwardedHeaders: forwardedHeadersTrusted,
    }),
    forwardedHeadersTrusted,
  };
}

export function getActivityUserKey(activity: RuntimeWebSocketActivity): string | null {
  const userId = String(activity.userId ?? "").trim();
  if (userId) {
    return `id:${userId}`;
  }

  const username = String(activity.username || "").trim().toLowerCase();
  return username ? `username:${username}` : null;
}

export function sanitizeRuntimeWebSocketError(
  error: unknown,
): Record<string, unknown> | undefined {
  if (typeof error === "string") {
    return {
      type: "string",
    };
  }

  if (!error || typeof error !== "object") {
    return undefined;
  }

  const errorLike = error as RuntimeWebSocketErrorLike;
  const name = typeof errorLike.name === "string" ? errorLike.name.trim() : "";
  const code = typeof errorLike.code === "string" ? errorLike.code.trim() : "";
  const type = typeof errorLike.type === "string" ? errorLike.type.trim() : "";

  return {
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
    ...(type ? { type } : {}),
  };
}

export function serializeRuntimeWsPayload(payload: Record<string, unknown>): string | null {
  try {
    const message = JSON.stringify(payload);
    if (Buffer.byteLength(message, "utf8") > MAX_RUNTIME_WS_MESSAGE_BYTES) {
      logger.warn("WebSocket broadcast skipped because the payload is too large", {
        maxBytes: MAX_RUNTIME_WS_MESSAGE_BYTES,
      });
      return null;
    }

    return message;
  } catch (error) {
    logger.warn("WebSocket broadcast skipped because the payload could not be serialized", {
      error: sanitizeRuntimeWebSocketError(error),
    });
    return null;
  }
}
