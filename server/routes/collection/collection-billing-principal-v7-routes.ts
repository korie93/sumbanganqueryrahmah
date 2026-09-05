import type { Response } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
import { readQueryObject, readRouteParam } from "../../http/validation";
import { sendCollectionError } from "./collection-route-handler-factories";
import type { CollectionRouteContext } from "./collection-route-shared";

const PREFIX = "/api/collection/report/billing-principal/saved-targets";

function targetId(req: AuthenticatedRequest) {
  return readRouteParam(req.params.targetId, "Saved Target ID", 80);
}

function revisionId(req: AuthenticatedRequest) {
  return readRouteParam(req.params.revisionId, "Target revision ID", 80);
}

export function registerCollectionBillingPrincipalV7Routes(context: CollectionRouteContext) {
  const {
    app,
    collectionService,
    jsonMutationRoute,
    jsonRoute,
    reportAccess,
    superuserReportAccess,
  } = context;

  app.get(
    PREFIX,
    ...reportAccess,
    jsonRoute("Failed to list Saved Billing Principal targets.", (req) =>
      collectionService.listBillingPrincipalSavedTargets(req.user)),
  );

  app.post(
    PREFIX,
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to create Saved Billing Principal target.",
      () => "collection:billing-principal:saved-target:create",
      (req) => collectionService.createBillingPrincipalSavedTarget(req.user, req.body),
    ),
  );

  app.get(
    `${PREFIX}/:targetId`,
    ...reportAccess,
    jsonRoute("Failed to load Saved Billing Principal target.", (req) =>
      collectionService.getBillingPrincipalSavedTarget(req.user, targetId(req))),
  );

  app.patch(
    `${PREFIX}/:targetId`,
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to update Saved Billing Principal target.",
      (req) => `collection:billing-principal:saved-target:${targetId(req)}`,
      (req) => collectionService.updateBillingPrincipalSavedTarget(req.user, targetId(req), req.body),
    ),
  );

  app.delete(
    `${PREFIX}/:targetId`,
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to delete Saved Billing Principal target.",
      (req) => `collection:billing-principal:saved-target:${targetId(req)}`,
      (req) => collectionService.deleteBillingPrincipalSavedTarget(
        req.user,
        targetId(req),
        readQueryObject(req.query).version,
      ),
    ),
  );

  const revisionPrefix = `${PREFIX}/:targetId/revisions/:revisionId`;

  app.get(
    `${revisionPrefix}/overview`,
    ...reportAccess,
    jsonRoute("Failed to load Saved Billing Principal overview.", (req) =>
      collectionService.getBillingPrincipalTargetOverview(
        req.user,
        targetId(req),
        revisionId(req),
        readQueryObject(req.query),
      )),
  );

  app.put(
    `${revisionPrefix}/client-results`,
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to save Client Result.",
      (req) => `collection:billing-principal:client-result:${targetId(req)}:${revisionId(req)}`,
      (req) => collectionService.upsertBillingPrincipalClientResults(
        req.user,
        targetId(req),
        revisionId(req),
        req.body,
      ),
    ),
  );

  app.get(
    `${revisionPrefix}/calendar`,
    ...reportAccess,
    jsonRoute("Failed to load Billing Principal calendar.", (req) =>
      collectionService.getBillingPrincipalCalendar(
        req.user,
        targetId(req),
        revisionId(req),
        readQueryObject(req.query),
      )),
  );

  app.get(
    `${revisionPrefix}/drilldown`,
    ...reportAccess,
    jsonRoute("Failed to load Billing Principal drilldown.", (req) =>
      collectionService.getBillingPrincipalDrilldown(
        req.user,
        targetId(req),
        revisionId(req),
        readQueryObject(req.query),
      )),
  );

  app.get(
    `${revisionPrefix}/export`,
    ...reportAccess,
    async (request, response: Response) => {
      const req = request as AuthenticatedRequest;
      try {
        const exported = await collectionService.exportBillingPrincipalTarget(
          req.user,
          targetId(req),
          revisionId(req),
          readQueryObject(req.query),
        );
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", exported.contentType);
        response.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.status(200).send(exported.buffer);
      } catch (error) {
        sendCollectionError(response, error, "Failed to export Billing Principal report.");
      }
    },
  );
}
