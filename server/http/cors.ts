import type { RequestHandler } from "express";
import { runtimeConfig } from "../config/runtime";

const DEFAULT_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token, X-Request-Id";
const LOCAL_DEV_ORIGINS = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

type CorsErrorPayload = {
  ok: false;
  error: {
    code: "CORS_ORIGIN_DENIED";
    message: string;
  };
};

type CorsEnvironment = {
  NODE_ENV?: string;
  ALLOW_LOCAL_DEV_CORS?: string;
  PUBLIC_APP_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;
};

type CorsEnvironmentSource = CorsEnvironment | NodeJS.ProcessEnv;

export function normalizeCorsOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const normalized = new URL(value.trim()).origin;
    return normalized || null;
  } catch {
    return null;
  }
}

function buildDefaultCorsEnvironment(): CorsEnvironmentSource {
  return {
    NODE_ENV: runtimeConfig.app.nodeEnv,
    ALLOW_LOCAL_DEV_CORS: process.env.ALLOW_LOCAL_DEV_CORS,
    PUBLIC_APP_URL: runtimeConfig.app.publicAppUrl ?? undefined,
    CORS_ALLOWED_ORIGINS: runtimeConfig.app.corsAllowedOrigins.join(","),
  };
}

export function resolveAllowedCorsOrigins(env: CorsEnvironmentSource = buildDefaultCorsEnvironment()): string[] {
  const origins = new Set<string>();
  const addOrigin = (value: string | null | undefined) => {
    const normalized = normalizeCorsOrigin(value);
    if (normalized) {
      origins.add(normalized);
    }
  };

  const configuredOrigins = String(env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const origin of configuredOrigins) {
    addOrigin(origin);
  }

  addOrigin(env.PUBLIC_APP_URL);

  if (
    String(env.NODE_ENV || "development") !== "production"
    && String(env.ALLOW_LOCAL_DEV_CORS || "").trim() === "1"
  ) {
    for (const origin of LOCAL_DEV_ORIGINS) {
      addOrigin(origin);
    }
  }

  return Array.from(origins);
}

export function createCorsMiddleware(
  allowedOrigins = resolveAllowedCorsOrigins(),
): RequestHandler {
  const allowedOriginSet = new Set(
    allowedOrigins
      .map((origin) => normalizeCorsOrigin(origin))
      .filter((origin): origin is string => Boolean(origin)),
  );

  const deniedPayload: CorsErrorPayload = {
    ok: false,
    error: {
      code: "CORS_ORIGIN_DENIED",
      message: "Origin is not allowed.",
    },
  };

  return (req, res, next) => {
    const requestOrigin = normalizeCorsOrigin(req.headers.origin);

    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
    res.header("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);

    if (!requestOrigin) {
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
      return next();
    }

    if (allowedOriginSet.has(requestOrigin)) {
      res.header("Access-Control-Allow-Origin", requestOrigin);
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
      return next();
    }

    if (req.method === "OPTIONS") {
      return res.status(403).json(deniedPayload);
    }

    return res.status(403).json(deniedPayload);
  };
}
