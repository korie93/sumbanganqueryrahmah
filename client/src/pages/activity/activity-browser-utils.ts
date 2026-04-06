import type { ParsedBrowserInfo } from "@/pages/activity/types";

export function parseActivityUserAgent(ua?: string): ParsedBrowserInfo {
  if (!ua) return { browser: "Unknown", version: "" };

  if (!ua.includes("Mozilla/") && !ua.includes("AppleWebKit")) {
    const parts = ua.split(" ");
    return { browser: parts[0] || ua, version: parts[1] || "" };
  }

  if (ua.includes("DuckDuckGo/")) {
    return { browser: "DuckDuckGo", version: ua.match(/DuckDuckGo\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Vivaldi/")) {
    return { browser: "Vivaldi", version: ua.match(/Vivaldi\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Brave/") || ua.includes("Brave")) {
    return { browser: "Brave", version: ua.match(/Chrome\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("OPR/") || ua.includes("Opera/")) {
    return { browser: "Opera", version: ua.match(/OPR\/(\d+)/)?.[1] || ua.match(/Opera\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Edg/") || ua.includes("Edge/")) {
    return { browser: "Edge", version: ua.match(/Edg\/(\d+)/)?.[1] || ua.match(/Edge\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Firefox/")) {
    return { browser: "Firefox", version: ua.match(/Firefox\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Chrome/")) {
    return { browser: "Chrome", version: ua.match(/Chrome\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    return { browser: "Safari", version: ua.match(/Version\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("curl/")) {
    return { browser: "curl", version: ua.match(/curl\/(\d+)/)?.[1] || "" };
  }

  return { browser: "Unknown", version: "" };
}
