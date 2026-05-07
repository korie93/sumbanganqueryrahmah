import { readOptionalString } from "../config/runtime-config-read-utils";
import { logger } from "../lib/logger";

function summarizeActivationUrlError(error: unknown): Record<string, unknown> | undefined {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "string") {
    return { type: "string" };
  }

  return undefined;
}

export function getPublicAppBaseUrl(): string {
  const configured = readOptionalString("PUBLIC_APP_URL");

  if (configured) {
    try {
      return new URL(configured).toString().replace(/\/+$/, "");
    } catch (error) {
      logger.warn("Invalid PUBLIC_APP_URL; falling back to local activation link base URL", {
        operation: "getPublicAppBaseUrl",
        configuredLength: configured.length,
        error: summarizeActivationUrlError(error),
      });
    }
  }

  return "http://127.0.0.1:5000";
}

export function buildActivationUrl(token: string): string {
  const baseUrl = getPublicAppBaseUrl();
  const url = new URL("/activate-account", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildPasswordResetUrl(token: string): string {
  const baseUrl = getPublicAppBaseUrl();
  const url = new URL("/reset-password", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
