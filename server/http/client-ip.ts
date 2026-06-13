import { isIP } from "node:net";
import type { Request } from "express";

export function normalizeClientIpAddress(value: unknown): string | null {
  let normalized = String(value || "").trim();
  if (!normalized || normalized.includes(",")) {
    return null;
  }

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }

  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex >= 0) {
    normalized = normalized.slice(0, zoneIndex);
  }

  if (normalized.toLowerCase().startsWith("::ffff:")) {
    const ipv4 = normalized.slice(7);
    if (isIP(ipv4) === 4) {
      return ipv4;
    }
  }

  return isIP(normalized) > 0 ? normalized.toLowerCase() : null;
}

export function resolveRequestClientIp(
  req: Pick<Request, "ip" | "socket">,
): string | null {
  return normalizeClientIpAddress(req.ip)
    ?? normalizeClientIpAddress(req.socket.remoteAddress);
}

export function maskClientIpAddress(value: unknown): string | null {
  const normalized = normalizeClientIpAddress(value);
  if (!normalized) {
    return null;
  }

  if (isIP(normalized) === 4) {
    const octets = normalized.split(".");
    return `${octets.slice(0, 3).join(".")}.x`;
  }

  const [head = "", tail = ""] = normalized.split("::", 2);
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missingGroups = Math.max(0, 8 - headGroups.length - tailGroups.length);
  const expandedGroups = [
    ...headGroups,
    ...Array.from({ length: missingGroups }, () => "0"),
    ...tailGroups,
  ];
  return `${expandedGroups.slice(0, 4).join(":")}::/64`;
}
