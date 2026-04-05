import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import type { SystemRouteContext } from "./system-route-context";

export function registerSystemRollupRoutes(context: SystemRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireMonitorAccess,
    getCollectionRollupQueueStatus,
    drainCollectionRollupQueue,
    retryCollectionRollupFailures,
    autoHealCollectionRollupQueue,
    rebuildCollectionRollups,
    createAuditLog,
  } = context;

  app.post(
    "/internal/rollup-refresh/status",
    authenticateToken,
    requireRole("superuser"),
    requireMonitorAccess,
    asyncHandler(async (_req, res) => {
      const snapshot = await getCollectionRollupQueueStatus();
      res.json({
        ok: true,
        snapshot,
      });
    }),
  );

  app.post(
    "/internal/rollup-refresh/drain",
    authenticateToken,
    requireRole("superuser"),
    requireMonitorAccess,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      await createAuditLog({
        action: "COLLECTION_ROLLUP_QUEUE_DRAIN_REQUESTED",
        performedBy: req.user?.username || "system",
        details: "Superuser requested an immediate collection rollup queue drain.",
      });
      res.json(await drainCollectionRollupQueue());
    }),
  );

  app.post(
    "/internal/rollup-refresh/retry-failures",
    authenticateToken,
    requireRole("superuser"),
    requireMonitorAccess,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      await createAuditLog({
        action: "COLLECTION_ROLLUP_QUEUE_RETRY_REQUESTED",
        performedBy: req.user?.username || "system",
        details: "Superuser requested retry of failed collection rollup refresh slices.",
      });
      res.json(await retryCollectionRollupFailures());
    }),
  );

  app.post(
    "/internal/rollup-refresh/auto-heal",
    authenticateToken,
    requireRole("superuser"),
    requireMonitorAccess,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      await createAuditLog({
        action: "COLLECTION_ROLLUP_QUEUE_AUTO_HEAL_REQUESTED",
        performedBy: req.user?.username || "system",
        details: "Superuser requested rollup queue auto-heal for interrupted slices.",
      });
      res.json(await autoHealCollectionRollupQueue());
    }),
  );

  app.post(
    "/internal/rollup-refresh/rebuild",
    authenticateToken,
    requireRole("superuser"),
    requireMonitorAccess,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      await createAuditLog({
        action: "COLLECTION_ROLLUP_REBUILD_REQUESTED",
        performedBy: req.user?.username || "system",
        details: "Superuser requested a full collection report rollup rebuild.",
      });
      res.json(await rebuildCollectionRollups());
    }),
  );
}
