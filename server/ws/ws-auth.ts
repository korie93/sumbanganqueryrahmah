import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

export type RuntimeWebSocketOriginOptions = {
  trustForwardedHeaders: boolean;
};

export function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }
  return String(value || "");
}

function firstForwardedValue(value: string | string[] | undefined): string {
  return firstHeaderValue(value).split(",")[0]?.trim() || "";
}

export function hasForwardedHeaders(headers: IncomingHttpHeaders): boolean {
  return Boolean(
    firstHeaderValue(headers["x-forwarded-for"])
    || firstHeaderValue(headers["x-forwarded-host"])
    || firstHeaderValue(headers["x-forwarded-proto"]),
  );
}

export function readWebSocketRequestHost(
  headers: IncomingHttpHeaders,
  options: RuntimeWebSocketOriginOptions,
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
  options: RuntimeWebSocketOriginOptions,
): string {
  const forwardedProto = options.trustForwardedHeaders
    ? firstForwardedValue(req.headers["x-forwarded-proto"]).toLowerCase()
    : "";
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  return req.socket && "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";
}

export function isSameOriginWebSocketRequest(
  req: Pick<IncomingMessage, "headers" | "socket">,
  options: RuntimeWebSocketOriginOptions,
): boolean {
  const origin = firstHeaderValue(req.headers.origin).trim();
  if (!origin) {
    return true;
  }

  const requestHost = readWebSocketRequestHost(req.headers, options);
  if (!requestHost) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    if (originUrl.host.toLowerCase() !== requestHost) {
      return false;
    }

    const requestProto = readWebSocketRequestProto(req, options);
    return originUrl.protocol === `${requestProto}:`;
  } catch {
    return false;
  }
}
