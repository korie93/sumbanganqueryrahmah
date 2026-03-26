import type { Express } from "express";
import { logger } from "../lib/logger";

export function applyTrustedProxies(app: Express, trustedProxies: readonly string[]) {
  const normalized = Array.from(
    new Set(
      trustedProxies
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  app.set("trust proxy", normalized.length > 0 ? normalized : false);

  logger.info("Express trust proxy configured", {
    enabled: normalized.length > 0,
    trustedProxies: normalized,
  });
}
