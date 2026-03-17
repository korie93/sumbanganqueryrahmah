import { createCollectionRouteContext, type CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionNicknameRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    reportAccess,
    superuserReportAccess,
    jsonRoute,
  } = context;

  app.get(
    "/api/collection/nicknames",
    ...reportAccess,
    jsonRoute("Failed to load staff nicknames.", (req) =>
      collectionService.listNicknames(req.user, req.query.includeInactive)),
  );

  app.post(
    "/api/collection/nickname-auth/check",
    ...reportAccess,
    jsonRoute("Failed to validate nickname.", (req) => collectionService.checkNicknameAuth(req.user, req.body)),
  );

  app.post(
    "/api/collection/nickname-auth/setup-password",
    ...reportAccess,
    jsonRoute("Failed to set nickname password.", (req) => collectionService.setupNicknamePassword(req.user, req.body)),
  );

  app.post(
    "/api/collection/nickname-auth/login",
    ...reportAccess,
    jsonRoute("Failed to login nickname.", (req) => collectionService.loginNickname(req.user, req.body)),
  );

  app.post(
    "/api/collection/nicknames",
    ...superuserReportAccess,
    jsonRoute("Failed to create nickname.", (req) => collectionService.createNickname(req.user, req.body)),
  );

  app.put(
    "/api/collection/nicknames/:id",
    ...superuserReportAccess,
    jsonRoute("Failed to update nickname.", (req) =>
      collectionService.updateNickname(req.user, req.params.id, req.body)),
  );

  app.patch(
    "/api/collection/nicknames/:id",
    ...superuserReportAccess,
    jsonRoute("Failed to update nickname status.", (req) =>
      collectionService.updateNicknameStatus(req.user, req.params.id, req.body)),
  );

  app.post(
    "/api/collection/nicknames/:id/reset-password",
    ...superuserReportAccess,
    jsonRoute("Failed to reset nickname password.", (req) =>
      collectionService.resetNicknamePassword(req.user, req.params.id)),
  );

  app.delete(
    "/api/collection/nicknames/:id",
    ...superuserReportAccess,
    jsonRoute("Failed to delete nickname.", (req) => collectionService.deleteNickname(req.user, req.params.id)),
  );
}
