import { readOptionalString } from "../config/runtime-config-read-utils";
import { logger } from "../lib/logger";

let hasWarnedInvalidPublicAppUrlConfiguration = false;

function warnInvalidPublicAppUrlConfiguration(configured: string) {
  if (hasWarnedInvalidPublicAppUrlConfiguration) {
    return;
  }

  hasWarnedInvalidPublicAppUrlConfiguration = true;
  logger.warn("PUBLIC_APP_URL is invalid; activation links are falling back to the local default base URL", {
    configuredLength: configured.length,
  });
}

export function getPublicAppBaseUrl(): string {
  const configured = readOptionalString("PUBLIC_APP_URL");

  if (configured) {
    try {
      return new URL(configured).toString().replace(/\/+$/, "");
    } catch (error) {
      warnInvalidPublicAppUrlConfiguration(configured);
      logger.debug("PUBLIC_APP_URL parse failed before activation-link fallback", {
        error: error instanceof Error ? error.message : "Invalid PUBLIC_APP_URL",
      });
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
