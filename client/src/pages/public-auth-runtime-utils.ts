import { formatDateTimeDDMMYYYY } from "@/lib/date-format";

export function getPublicAuthTokenFromLocation(locationSearch?: string | null | undefined) {
  const search =
    typeof locationSearch === "string"
      ? locationSearch
      : typeof window === "undefined"
        ? ""
        : window.location.search;
  return new URLSearchParams(search).get("token") || "";
}

export function formatPublicAuthExpiry(value: string) {
  return formatDateTimeDDMMYYYY(value, { fallback: value });
}

export function isPublicAuthAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
