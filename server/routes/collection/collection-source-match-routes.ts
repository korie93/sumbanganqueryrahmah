import type { CollectionRouteContext } from "./collection-route-shared";
import { readQueryObject, readRouteParam } from "../../http/validation";

export function registerCollectionSourceMatchRoutes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    jsonMutationRoute,
    jsonRoute,
    reportAccess,
    sourceMatchAccess,
    superuserReportAccess,
  } = context;

  app.get(
    "/api/collection/source-files",
    ...sourceMatchAccess,
    jsonRoute("Failed to list Saved collection sources.", (req) =>
      collectionService.listSourceFiles(req.user, req.query)),
  );

  app.post(
    "/api/collection/source-matches",
    ...sourceMatchAccess,
    jsonRoute("Failed to match Saved collection sources.", (req) =>
      collectionService.listSourceMatches(req.user, req.body)),
  );

  app.get(
    "/api/collection/source-configs",
    ...reportAccess,
    jsonRoute("Failed to list Collection source configurations.", (req) =>
      collectionService.listSourceConfigs(req.user)),
  );

  app.get(
    "/api/collection/source-configs/:sourceImportId",
    ...superuserReportAccess,
    jsonRoute("Failed to load Collection source configuration.", (req) =>
      collectionService.getSourceConfig(
        req.user,
        readRouteParam(req.params.sourceImportId, "Saved source ID", 200),
      )),
  );

  app.put(
    "/api/collection/source-configs/:sourceImportId",
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to configure Collection matching source.",
      (req) => `collection:source-config:${readRouteParam(req.params.sourceImportId, "Saved source ID", 200)}`,
      (req) => collectionService.configureSource(
        req.user,
        readRouteParam(req.params.sourceImportId, "Saved source ID", 200),
        req.body,
      ),
    ),
  );

  app.delete(
    "/api/collection/source-configs/:sourceImportId",
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to remove Collection matching source configuration.",
      (req) => `collection:source-config:${readRouteParam(req.params.sourceImportId, "Saved source ID", 200)}`,
      (req) => collectionService.deleteSourceConfig(
        req.user,
        readRouteParam(req.params.sourceImportId, "Saved source ID", 200),
      ),
    ),
  );

  app.get(
    "/api/collection/report/billing-principal",
    ...reportAccess,
    jsonRoute("Failed to load Billing Principal report.", (req) =>
      collectionService.getBillingPrincipalReport(req.user, readQueryObject(req.query))),
  );

  app.get(
    "/api/collection/report/billing-principal/targets",
    ...reportAccess,
    jsonRoute("Failed to load Billing Principal targets.", (req) =>
      collectionService.getBillingPrincipalTargets(req.user, readQueryObject(req.query))),
  );

  app.put(
    "/api/collection/report/billing-principal/targets",
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to configure Billing Principal targets.",
      () => "collection:billing-principal-targets",
      (req) => collectionService.upsertBillingPrincipalTargets(req.user, req.body),
    ),
  );
}
