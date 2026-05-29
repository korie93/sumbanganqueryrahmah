import type { RequestHandler, Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/guards";
import { runtimeConfig } from "../config/runtime";
import { buildApiErrorResponse } from "../http/api-error-response";
import { asyncHandler } from "../http/async-handler";
import type { ChaosType } from "../intelligence/types";
import { logger } from "../lib/logger";
import type { SystemRouteContext } from "./system-route-context";

const ALLOWED_CHAOS_TYPES = [
  "cpu_spike",
  "db_latency_spike",
  "ai_delay",
  "worker_crash",
  "memory_pressure",
] as const satisfies readonly ChaosType[];

const MAX_CHAOS_MAGNITUDE = 100_000;
const MIN_CHAOS_DURATION_MS = 5_000;
const MAX_CHAOS_DURATION_MS = 5 * 60_000;
const CHAOS_PAYLOAD_ERROR_CODE = "INVALID_CHAOS_PAYLOAD";

function normalizeOptionalNumericInput(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? Number.NaN : Number(trimmed);
  }
  return value;
}

const optionalChaosMagnitudeSchema = z.preprocess(
  normalizeOptionalNumericInput,
  z.number()
    .finite("Magnitude must be finite.")
    .min(0, "Magnitude must be zero or greater.")
    .max(MAX_CHAOS_MAGNITUDE, "Magnitude exceeds the supported maximum.")
    .optional(),
);

const optionalChaosDurationSchema = z.preprocess(
  normalizeOptionalNumericInput,
  z.number()
    .finite("Duration must be finite.")
    .int("Duration must be an integer number of milliseconds.")
    .min(MIN_CHAOS_DURATION_MS, "Duration is below the supported minimum.")
    .max(MAX_CHAOS_DURATION_MS, "Duration exceeds the supported maximum.")
    .optional(),
);

const chaosInjectionPayloadSchema = z.object({
  type: z.enum(ALLOWED_CHAOS_TYPES),
  magnitude: optionalChaosMagnitudeSchema,
  durationMs: optionalChaosDurationSchema,
}).strict();

const rejectChaosInProductionLike: RequestHandler = (_req, res, next) => {
  if (!runtimeConfig.app.isProductionLike) {
    return next();
  }

  return res.status(404).json(buildApiErrorResponse("Not found", {
    statusCode: 404,
  }));
};

export function registerSystemChaosRoutes(context: SystemRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    injectChaos,
    createAuditLog,
  } = context;

  app.post(
    "/api/internal/chaos/inject",
    rejectChaosInProductionLike,
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const payload = chaosInjectionPayloadSchema.safeParse(req.body);

      if (!payload.success) {
        logger.warn("Chaos injection payload rejected", {
          event: "chaos_payload_rejected",
          count: payload.error.issues.length,
          status: req.user ? "authenticated" : "unknown",
        });
        return res.status(400).json({
          ...buildApiErrorResponse("Invalid chaos payload.", {
            code: CHAOS_PAYLOAD_ERROR_CODE,
            details: payload.error.flatten(),
          }),
          allowed: [...ALLOWED_CHAOS_TYPES],
        });
      }

      const { type, magnitude, durationMs } = payload.data;
      const result = injectChaos({
        type,
        magnitude,
        durationMs,
      });

      await createAuditLog({
        action: "CHAOS_INJECTED",
        performedBy: req.user?.username || "system",
        details: `Chaos injected: ${type}`,
      });

      return res.json({
        success: true,
        ...result,
      });
    }),
  );
}
