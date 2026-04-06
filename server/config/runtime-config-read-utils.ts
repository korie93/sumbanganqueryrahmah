import { randomBytes } from "node:crypto";
import {
  readBooleanEnvFlag,
  resolveRuntimeEnvironment,
  type RuntimeEnvironment,
} from "./runtime-environment";

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export function readOptionalString(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function readString(name: string, fallback: string): string {
  return readOptionalString(name) ?? fallback;
}

export function readInt(name: string, fallback: number, options?: { min?: number; max?: number }): number {
  const raw = readOptionalString(name);
  const parsed = raw == null ? fallback : Number(raw);
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  const min = options?.min ?? Number.NEGATIVE_INFINITY;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, normalized));
}

export function readBoolean(name: string, fallback: boolean): boolean {
  return readBooleanEnvFlag(name, fallback);
}

export function readCommaSeparatedList(name: string): string[] {
  const raw = readOptionalString(name);
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function normalizeHttpUrl(name: string, rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${name} must be a valid absolute http:// or https:// URL.`);
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${name} must use http:// or https://.`);
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeCorsOrigin(name: string, rawValue: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${name} entries must be valid absolute origins.`);
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${name} entries must use http:// or https://.`);
  }

  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error(`${name} entries must be bare origins without paths, query strings, or hashes.`);
  }

  return parsed.origin;
}

export function buildEphemeralSecret(label: string) {
  return `${label.toLowerCase()}-${randomBytes(32).toString("hex")}`;
}

export function readSecretOrThrow(
  name: string,
  isRequired: boolean,
  fallbackFactory: () => string,
) {
  const value = readOptionalString(name);
  if (value) {
    return value;
  }
  if (isRequired) {
    throw new Error(`${name} is required outside strict local development.`);
  }
  return fallbackFactory();
}

export function resolveNodeEnv(): RuntimeEnvironment {
  return resolveRuntimeEnvironment(process.env.NODE_ENV);
}
