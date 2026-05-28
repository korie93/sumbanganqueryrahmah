const ALLOWED_EMAIL_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function escapeEmailHtmlContent(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function escapeEmailHtml(value: string | null | undefined): string {
  return escapeEmailHtmlContent(value);
}

export function escapeEmailHtmlWithLineBreaks(value: string | null | undefined): string {
  return escapeEmailHtmlContent(value).replace(/\r\n|\r|\n/g, "<br>");
}

export function normalizeEmailUrl(value: string | null | undefined): string | null {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    if (!ALLOWED_EMAIL_URL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function escapeEmailUrl(value: string | null | undefined): string {
  const normalizedUrl = normalizeEmailUrl(value);
  return normalizedUrl ? escapeEmailHtmlContent(normalizedUrl) : "#";
}
