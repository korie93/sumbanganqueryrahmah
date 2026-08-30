import type { CollectionRouteContext } from "./collection-route-shared";

export function registerCollectionSourceMatchRoutes(context: CollectionRouteContext) {
  const { app, collectionService, jsonRoute, sourceMatchAccess } = context;

  app.post(
    "/api/collection/source-matches",
    ...sourceMatchAccess,
    jsonRoute("Failed to match Saved collection sources.", (req) =>
      collectionService.listSourceMatches(req.user, req.body)),
  );
}
