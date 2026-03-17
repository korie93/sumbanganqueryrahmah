import type { Express } from "express";
import {
  createCollectionRouteContext,
  type CollectionRouteDeps,
} from "./collection/collection-route-shared";
import { registerCollectionAdminRoutes } from "./collection/collection-admin-routes";
import { registerCollectionNicknameRoutes } from "./collection/collection-nickname-routes";
import { registerCollectionReportRoutes } from "./collection/collection-report-routes";

export function registerCollectionRoutes(app: Express, deps: CollectionRouteDeps) {
  const context = createCollectionRouteContext(app, deps);
  registerCollectionNicknameRoutes(context);
  registerCollectionAdminRoutes(context);
  registerCollectionReportRoutes(context);
}
