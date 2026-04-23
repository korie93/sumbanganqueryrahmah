const SAFE_URL_BASE_FALLBACK = "https://app.sqr.invalid";

type ResolveSafeUrlOptions = {
  allowedProtocols?: readonly string[];
  baseUrl?: string | URL;
  sameOriginOnly?: boolean;
};

type ResolveSafePreviewUrlOptions = {
  baseUrl?: string | URL;
  allowBlob?: boolean;
};

function normalizeUrlValue(value: string | null | undefined): string {
  return String(value || "").trim();
}

function resolveUrlBase(baseUrl?: string | URL): URL {
  if (baseUrl instanceof URL) {
    return baseUrl;
  }

  const normalizedBaseUrl = normalizeUrlValue(baseUrl);
  if (normalizedBaseUrl) {
    return new URL(normalizedBaseUrl);
  }

  if (typeof window !== "undefined" && window.location?.href) {
    return new URL(window.location.href);
  }

  return new URL(SAFE_URL_BASE_FALLBACK);
}

export function resolveSafeUrl(
  value: string | null | undefined,
  {
    allowedProtocols = ["http:", "https:"],
    baseUrl,
    sameOriginOnly = false,
  }: ResolveSafeUrlOptions = {},
): string | null {
  const normalizedValue = normalizeUrlValue(value);
  if (!normalizedValue) {
    return null;
  }

  const resolvedBase = resolveUrlBase(baseUrl);
  const allowedProtocolSet = new Set(
    allowedProtocols.map((protocol) => String(protocol).trim().toLowerCase()).filter(Boolean),
  );

  try {
    const resolvedUrl = new URL(normalizedValue, resolvedBase);
    const normalizedProtocol = resolvedUrl.protocol.toLowerCase();

    if (!allowedProtocolSet.has(normalizedProtocol)) {
      return null;
    }

    if (sameOriginOnly && resolvedUrl.origin !== resolvedBase.origin) {
      return null;
    }

    return resolvedUrl.toString();
  } catch {
    return null;
  }
}

export function resolveSafeHttpUrl(
  value: string | null | undefined,
  options: Omit<ResolveSafeUrlOptions, "allowedProtocols"> = {},
): string | null {
  return resolveSafeUrl(value, {
    ...options,
    allowedProtocols: ["http:", "https:"],
  });
}

export function resolveSafeNavigationUrl(
  value: string | null | undefined,
  options: Omit<ResolveSafeUrlOptions, "allowedProtocols" | "sameOriginOnly"> = {},
): string | null {
  return resolveSafeUrl(value, {
    ...options,
    allowedProtocols: ["http:", "https:"],
    sameOriginOnly: true,
  });
}

export function resolveSafePreviewSourceUrl(
  value: string | null | undefined,
  { baseUrl, allowBlob = true }: ResolveSafePreviewUrlOptions = {},
): string | null {
  const normalizedValue = normalizeUrlValue(value);
  if (!normalizedValue) {
    return null;
  }

  const resolvedBase = resolveUrlBase(baseUrl);
  const allowedProtocols = allowBlob
    ? new Set(["http:", "https:", "blob:"])
    : new Set(["http:", "https:"]);

  try {
    const resolvedUrl = new URL(normalizedValue, resolvedBase);
    const normalizedProtocol = resolvedUrl.protocol.toLowerCase();

    if (!allowedProtocols.has(normalizedProtocol)) {
      return null;
    }

    if (resolvedUrl.origin !== resolvedBase.origin) {
      return null;
    }

    return resolvedUrl.toString();
  } catch {
    return null;
  }
}
