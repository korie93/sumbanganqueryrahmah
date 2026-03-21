export const API_BASE = "";

export function getAuthHeader(): HeadersInit {
  return {};
}

export const CSRF_COOKIE_NAME = "sqr_csrf";

export function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const target = `${name}=`;
  const segments = String(document.cookie || "").split(";");
  for (const segment of segments) {
    const value = String(segment || "").trim();
    if (!value.startsWith(target)) {
      continue;
    }
    const rawCookieValue = value.slice(target.length);
    if (!rawCookieValue) {
      return null;
    }
    try {
      return decodeURIComponent(rawCookieValue);
    } catch {
      return rawCookieValue;
    }
  }

  return null;
}

export function getCsrfToken(): string | null {
  return readCookieValue(CSRF_COOKIE_NAME);
}

export function getCsrfHeader(): HeadersInit {
  const token = getCsrfToken();
  if (!token) {
    return {};
  }
  return { "X-CSRF-Token": token };
}
