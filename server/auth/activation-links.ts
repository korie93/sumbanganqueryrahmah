import { readOptionalString } from "../config/runtime-config-read-utils";

export function getPublicAppBaseUrl(): string {
  const configured = readOptionalString("PUBLIC_APP_URL");

  if (configured) {
    try {
      return new URL(configured).toString().replace(/\/+$/, "");
    } catch {
      // Fall back to local default below when the configured value is invalid.
    }
  }

  return "http://127.0.0.1:5000";
}

export function buildActivationUrl(token: string): string {
  const baseUrl = getPublicAppBaseUrl();
  const url = new URL("/activate-account", baseUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function buildPasswordResetUrl(token: string): string {
  const baseUrl = getPublicAppBaseUrl();
  const url = new URL("/reset-password", baseUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
