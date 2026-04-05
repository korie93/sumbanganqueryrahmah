import type { Response } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import type { ChaosType } from "../intelligence/types";
import type { SystemRouteContext } from "./system-route-context";

const allowedChaosTypes = new Set<ChaosType>([
  "cpu_spike",
  "db_latency_spike",
  "ai_delay",
  "worker_crash",
  "memory_pressure",
]);

export function registerSystemChaosRoutes(context: SystemRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    injectChaos,
    createAuditLog,
  } = context;

  app.post(
    "/internal/chaos/inject",
    authenticateToken,
    requireRole("admin", "superuser"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body =
        req.body && typeof req.body === "object"
          ? req.body as Record<string, unknown>
          : {};
      const type = body.type as ChaosType;

      if (!allowedChaosTypes.has(type)) {
        return res.status(400).json({
          message: "Invalid chaos type.",
          allowed: Array.from(allowedChaosTypes),
        });
      }

      const result = injectChaos({
        type,
        magnitude: Number.isFinite(Number(body.magnitude)) ? Number(body.magnitude) : undefined,
        durationMs: Number.isFinite(Number(body.durationMs)) ? Number(body.durationMs) : undefined,
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
