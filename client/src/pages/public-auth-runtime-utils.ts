import { formatDateTimeDDMMYYYYMalaysia } from "@/lib/date-format";

function normalizeLocationParamSource(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.startsWith("?") || normalized.startsWith("#")
    ? normalized.slice(1)
    : normalized;
}

function scrubTokenFromParamSource(value: string | null | undefined, prefix: "?" | "#") {
  const params = new URLSearchParams(normalizeLocationParamSource(value));
  params.delete("token");
  const nextValue = params.toString();
  return nextValue ? `${prefix}${nextValue}` : "";
}

export function getPublicAuthTokenFromLocation(
  locationSearch?: string | null | undefined,
  locationHash?: string | null | undefined,
) {
  const search =
    typeof locationSearch === "string"
      ? locationSearch
      : typeof window === "undefined"
        ? ""
        : window.location.search;
  const hash =
    typeof locationHash === "string"
      ? locationHash
      : typeof window === "undefined"
        ? ""
        : window.location.hash;

  return (
    new URLSearchParams(normalizeLocationParamSource(hash)).get("token")
    || new URLSearchParams(normalizeLocationParamSource(search)).get("token")
    || ""
  );
}

export function buildPublicAuthLocationWithoutToken(
  pathname: string,
  locationSearch?: string | null | undefined,
  locationHash?: string | null | undefined,
) {
  const normalizedPath = String(pathname || "").trim() || "/";
  const search = scrubTokenFromParamSource(locationSearch, "?");
  const hash = scrubTokenFromParamSource(locationHash, "#");
  return `${normalizedPath}${search}${hash}`;
}

export function scrubPublicAuthTokenFromLocation() {
  if (typeof window === "undefined") {
    return;
  }

  const currentLocation =
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const scrubbedLocation = buildPublicAuthLocationWithoutToken(
    window.location.pathname,
    window.location.search,
    window.location.hash,
  );

  if (scrubbedLocation !== currentLocation) {
    window.history.replaceState({}, "", scrubbedLocation);
  }
}

export function formatPublicAuthExpiry(value: string) {
  return formatDateTimeDDMMYYYYMalaysia(value, { fallback: value });
}

export function isPublicAuthAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
