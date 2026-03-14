import type { Express, RequestHandler } from "express";
import type { AuthenticatedRequest } from "../auth/guards";
import { HttpError } from "../http/errors";
import { CollectionService } from "../services/collection.service";
import type { PostgresStorage } from "../storage-postgres";
import { serveCollectionReceipt } from "./collection-receipt.service";

type CollectionRouteDeps = {
  storage: PostgresStorage;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
};

function sendCollectionError(res: any, err: unknown, fallbackMessage: string) {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      ok: false,
      message: err.message,
      ...(err.code ? { error: { code: err.code, message: err.message } } : {}),
    });
  }

  const message = (err as { message?: string })?.message || fallbackMessage;
  return res.status(500).json({ ok: false, message });
}

function jsonRoute(
  fallbackMessage: string,
  handler: (req: AuthenticatedRequest) => Promise<unknown>,
): RequestHandler {
  return async (req, res) => {
    try {
      return res.json(await handler(req as AuthenticatedRequest));
    } catch (err) {
      return sendCollectionError(res, err, fallbackMessage);
    }
  };
}

export function registerCollectionRoutes(app: Express, deps: CollectionRouteDeps) {
  const { storage, authenticateToken, requireRole, requireTabAccess } = deps;
  const collectionService = new CollectionService(storage);

  app.get(
    "/api/collection/nicknames",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load staff nicknames.", (req) =>
      collectionService.listNicknames(req.user, req.query.includeInactive)),
  );

  app.post(
    "/api/collection/nickname-auth/check",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to validate nickname.", (req) => collectionService.checkNicknameAuth(req.user, req.body)),
  );

  app.post(
    "/api/collection/nickname-auth/setup-password",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to set nickname password.", (req) => collectionService.setupNicknamePassword(req.user, req.body)),
  );

  app.post(
    "/api/collection/nickname-auth/login",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to login nickname.", (req) => collectionService.loginNickname(req.user, req.body)),
  );

  app.get(
    "/api/collection/admins",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load admin list.", async () => collectionService.listAdmins()),
  );

  app.get(
    "/api/collection/admin-groups",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load admin groups.", async () => collectionService.listAdminGroups()),
  );

  app.post(
    "/api/collection/admin-groups",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to create admin group.", (req) => collectionService.createAdminGroup(req.user, req.body)),
  );

  app.put(
    "/api/collection/admin-groups/:groupId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to update admin group.", (req) =>
      collectionService.updateAdminGroup(req.user, req.params.groupId, req.body)),
  );

  app.delete(
    "/api/collection/admin-groups/:groupId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to delete admin group.", (req) =>
      collectionService.deleteAdminGroup(req.user, req.params.groupId)),
  );

  app.get(
    "/api/collection/nickname-assignments/:adminId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load nickname assignments.", (req) =>
      collectionService.getNicknameAssignments(req.params.adminId)),
  );

  app.put(
    "/api/collection/nickname-assignments/:adminId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to save nickname assignments.", (req) =>
      collectionService.setNicknameAssignments(req.user, req.params.adminId, req.body)),
  );

  app.post(
    "/api/collection/nicknames",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to create nickname.", (req) => collectionService.createNickname(req.user, req.body)),
  );

  app.put(
    "/api/collection/nicknames/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to update nickname.", (req) =>
      collectionService.updateNickname(req.user, req.params.id, req.body)),
  );

  app.patch(
    "/api/collection/nicknames/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to update nickname status.", (req) =>
      collectionService.updateNicknameStatus(req.user, req.params.id, req.body)),
  );

  app.post(
    "/api/collection/nicknames/:id/reset-password",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to reset nickname password.", (req) =>
      collectionService.resetNicknamePassword(req.user, req.params.id)),
  );

  app.delete(
    "/api/collection/nicknames/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to delete nickname.", (req) => collectionService.deleteNickname(req.user, req.params.id)),
  );

  app.post(
    "/api/collection",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to create collection record.", (req) => collectionService.createRecord(req.user, req.body)),
  );

  app.get(
    "/api/collection/summary",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load collection summary.", (req) =>
      collectionService.getSummary(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/list",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load collection records.", (req) =>
      collectionService.listRecords(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/purge-summary",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load purge summary.", (req) => collectionService.getPurgeSummary(req.user)),
  );

  app.get(
    "/api/collection/nickname-summary",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to load nickname summary.", (req) =>
      collectionService.getNicknameSummary(req.user, req.query as Record<string, unknown>)),
  );

  app.get(
    "/api/collection/:id/receipt/view",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "view"),
  );

  app.get(
    "/api/collection/:id/receipt/download",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "download"),
  );

  app.get(
    "/api/collection/:id/receipts/:receiptId/view",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req: AuthenticatedRequest, res) =>
      serveCollectionReceipt(storage, req, res, "view", req.params.receiptId),
  );

  app.get(
    "/api/collection/:id/receipts/:receiptId/download",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req: AuthenticatedRequest, res) =>
      serveCollectionReceipt(storage, req, res, "download", req.params.receiptId),
  );

  app.get(
    "/api/receipts/:id/view",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "view"),
  );

  app.get(
    "/api/receipts/:id/download",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    async (req: AuthenticatedRequest, res) => serveCollectionReceipt(storage, req, res, "download"),
  );

  const handleUpdateCollectionRecord = jsonRoute("Failed to update collection record.", (req) =>
    collectionService.updateRecord(req.user, req.params.id, req.body));

  app.patch(
    "/api/collection/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    handleUpdateCollectionRecord,
  );

  app.put(
    "/api/collection/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    handleUpdateCollectionRecord,
  );

  app.delete(
    "/api/collection/purge-old",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to purge old collection records.", (req) =>
      collectionService.purgeOldRecords(req.user, req.body)),
  );

  app.delete(
    "/api/collection/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("collection-report"),
    jsonRoute("Failed to delete collection record.", (req) =>
      collectionService.deleteRecord(req.user, req.params.id)),
  );
}
