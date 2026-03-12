export function parseBrowser(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown";

  const ua = userAgent;
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
