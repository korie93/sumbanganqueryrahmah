import type { CollectionRouteContext } from "./collection-route-shared";
import { readRouteParam } from "../../http/validation";

export function registerCollectionAdminRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    superuserReportAccess,
    jsonRoute,
  } = context;

  app.get(
    "/api/collection/admins",
    ...superuserReportAccess,
    jsonRoute("Failed to load admin list.", async () => collectionService.listAdmins()),
  );

  app.get(
    "/api/collection/admin-groups",
    ...superuserReportAccess,
    jsonRoute("Failed to load admin groups.", async () => collectionService.listAdminGroups()),
  );

  app.post(
    "/api/collection/admin-groups",
    ...superuserReportAccess,
    jsonRoute("Failed to create admin group.", (req) => collectionService.createAdminGroup(req.user, req.body)),
  );

  app.put(
    "/api/collection/admin-groups/:groupId",
    ...superuserReportAccess,
    jsonRoute("Failed to update admin group.", (req) =>
      collectionService.updateAdminGroup(req.user, readRouteParam(req.params.groupId, "admin group id"), req.body)),
  );

  app.delete(
    "/api/collection/admin-groups/:groupId",
    ...superuserReportAccess,
    jsonRoute("Failed to delete admin group.", (req) =>
      collectionService.deleteAdminGroup(req.user, readRouteParam(req.params.groupId, "admin group id"))),
  );

  app.get(
    "/api/collection/nickname-assignments/:adminId",
    ...superuserReportAccess,
    jsonRoute("Failed to load nickname assignments.", (req) =>
      collectionService.getNicknameAssignments(readRouteParam(req.params.adminId, "admin id"))),
  );

  app.put(
    "/api/collection/nickname-assignments/:adminId",
    ...superuserReportAccess,
    jsonRoute("Failed to save nickname assignments.", (req) =>
      collectionService.setNicknameAssignments(req.user, readRouteParam(req.params.adminId, "admin id"), req.body)),
  );
}
