export type ClientDeviceType = "desktop" | "mobile" | "tablet" | "unknown";

const MAX_USER_AGENT_LENGTH = 1024;

function normalizeUserAgent(userAgent: string | string[] | null | undefined): string {
  const value = Array.isArray(userAgent) ? userAgent[0] : userAgent;
  return String(value || "").trim().slice(0, MAX_USER_AGENT_LENGTH);
}

export function parseBrowser(userAgent: string | null | undefined): string {
  const normalized = normalizeUserAgent(userAgent);
  if (!normalized) return "Unknown";

  const ua = normalized;
  const uaLower = ua.toLowerCase();

  const extractVersion = (pattern: RegExp): string => {
    const match = ua.match(pattern);
    if (match && match[1]) {
      return match[1].split(".")[0];
    }
    return "";
  };

  if (uaLower.includes("edg/")) {
    const version = extractVersion(/Edg\/(\d+[\d.]*)/i);
    return version ? `Edge ${version}` : "Edge";
  }
  if (uaLower.includes("edge/")) {
    const version = extractVersion(/Edge\/(\d+[\d.]*)/i);
    return version ? `Edge ${version}` : "Edge";
  }
  if (uaLower.includes("opr/")) {
    const version = extractVersion(/OPR\/(\d+[\d.]*)/i);
    return version ? `Opera ${version}` : "Opera";
  }
  if (uaLower.includes("opera/")) {
    const version = extractVersion(/Opera\/(\d+[\d.]*)/i);
    return version ? `Opera ${version}` : "Opera";
  }
  if (uaLower.includes("brave")) {
    const version = extractVersion(/Brave\/(\d+[\d.]*)/i) || extractVersion(/Chrome\/(\d+[\d.]*)/i);
    return version ? `Brave ${version}` : "Brave";
  }
  if (uaLower.includes("duckduckgo")) {
    const version = extractVersion(/DuckDuckGo\/(\d+[\d.]*)/i);
    return version ? `DuckDuckGo ${version}` : "DuckDuckGo";
  }
  if (uaLower.includes("vivaldi")) {
    const version = extractVersion(/Vivaldi\/(\d+[\d.]*)/i);
    return version ? `Vivaldi ${version}` : "Vivaldi";
  }
  if (uaLower.includes("firefox/") || uaLower.includes("fxios/")) {
    const version = extractVersion(/Firefox\/(\d+[\d.]*)/i) || extractVersion(/FxiOS\/(\d+[\d.]*)/i);
    return version ? `Firefox ${version}` : "Firefox";
  }
  if (uaLower.includes("safari/") && !uaLower.includes("chrome/") && !uaLower.includes("chromium/")) {
    const version = extractVersion(/Version\/(\d+[\d.]*)/i);
    return version ? `Safari ${version}` : "Safari";
  }
  if (uaLower.includes("chrome/") || uaLower.includes("crios/") || uaLower.includes("chromium/")) {
    const version = extractVersion(/Chrome\/(\d+[\d.]*)/i) || extractVersion(/CriOS\/(\d+[\d.]*)/i);
    return version ? `Chrome ${version}` : "Chrome";
  }
  if (uaLower.includes("msie") || uaLower.includes("trident/")) {
    const version = extractVersion(/MSIE (\d+[\d.]*)/i) || extractVersion(/rv:(\d+[\d.]*)/i);
    return version ? `Internet Explorer ${version}` : "Internet Explorer";
  }

  return "Unknown";
}

export function parsePlatform(userAgent: string | null | undefined): string {
  const normalized = normalizeUserAgent(userAgent);
  if (!normalized) return "Unknown";

  if (/windows nt 10\.0/i.test(normalized)) return "Windows 10/11";
  if (/windows/i.test(normalized)) return "Windows";
  if (/iphone|ipad|ipod/i.test(normalized)) return "iOS";
  if (/android/i.test(normalized)) return "Android";
  if (/macintosh|mac os x/i.test(normalized)) return "macOS";
  if (/cros/i.test(normalized)) return "ChromeOS";
  if (/linux/i.test(normalized)) return "Linux";

  return "Unknown";
}

export function parseDeviceType(
  userAgent: string | string[] | null | undefined,
): ClientDeviceType {
  const normalized = normalizeUserAgent(userAgent);
  if (!normalized) return "unknown";

  if (
    /ipad|tablet|kindle|silk/i.test(normalized)
    || /android/i.test(normalized) && !/mobile/i.test(normalized)
    || /macintosh/i.test(normalized) && /mobile/i.test(normalized)
  ) {
    return "tablet";
  }

  if (/iphone|ipod|android.*mobile|windows phone|mobile/i.test(normalized)) {
    return "mobile";
  }

  if (/windows|macintosh|cros|x11|linux/i.test(normalized)) {
    return "desktop";
  }

  return "unknown";
}

export function buildClientDeviceProfile(
  userAgent: string | string[] | null | undefined,
): {
  browserName: string;
  deviceType: ClientDeviceType;
  platform: string;
} {
  const normalized = normalizeUserAgent(userAgent);
  return {
    browserName: parseBrowser(normalized),
    deviceType: parseDeviceType(normalized),
    platform: parsePlatform(normalized),
  };
}

export function summarizeUserAgent(userAgent: string | null | undefined): string {
  const browser = parseBrowser(userAgent);
  const platform = parsePlatform(userAgent);

  if (browser === "Unknown") return platform;
  if (platform === "Unknown") return browser;
  return `${browser} on ${platform}`;
}
