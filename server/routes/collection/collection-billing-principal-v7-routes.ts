import type { Response } from "express";
import type { AuthenticatedRequest } from "../../auth/guards";
import { readQueryObject, readRouteParam } from "../../http/validation";
import { getRequestIdFromContext } from "../../lib/request-context";
import { sendCollectionError } from "./collection-route-handler-factories";
import type { CollectionRouteContext } from "./collection-route-shared";

const PREFIX = "/api/collection/report/billing-principal/saved-targets";

function targetId(req: AuthenticatedRequest) {
  return readRouteParam(req.params.targetId, "Saved Target ID", 80);
}

function revisionId(req: AuthenticatedRequest) {
  return readRouteParam(req.params.revisionId, "Target revision ID", 80);
}

function reconciliationId(req: AuthenticatedRequest) {
  return readRouteParam(req.params.reconciliationId, "Reconciliation ID", 80);
}

function requestId(req: AuthenticatedRequest) {
  return getRequestIdFromContext()
    || req.header("x-request-id")
    || req.header("x-correlation-id")
    || null;
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
    `${revisionPrefix}/reconciliation-candidates`,
    ...superuserReportAccess,
    jsonRoute("Failed to list reconciliation account candidates.", (req) =>
      collectionService.listBillingPrincipalReconciliationCandidates(
        req.user,
        targetId(req),
        revisionId(req),
        readQueryObject(req.query),
      )),
  );

  app.get(
    `${revisionPrefix}/reconciliations`,
    ...reportAccess,
    jsonRoute("Failed to list manual reconciliations.", (req) =>
      collectionService.listBillingPrincipalReconciliations(
        req.user,
        targetId(req),
        revisionId(req),
        readQueryObject(req.query),
      )),
  );

  app.post(
    `${revisionPrefix}/reconciliations`,
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to create manual reconciliation.",
      (req) => `collection:billing-principal:reconciliation:${targetId(req)}:${revisionId(req)}:create`,
      (req) => collectionService.createBillingPrincipalReconciliation(
        req.user,
        targetId(req),
        revisionId(req),
        req.body,
        requestId(req),
      ),
    ),
  );

  app.patch(
    `${revisionPrefix}/reconciliations/:reconciliationId`,
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to update manual reconciliation.",
      (req) => `collection:billing-principal:reconciliation:${reconciliationId(req)}`,
      (req) => collectionService.updateBillingPrincipalReconciliation(
        req.user,
        targetId(req),
        revisionId(req),
        reconciliationId(req),
        req.body,
        requestId(req),
      ),
    ),
  );

  app.post(
    `${revisionPrefix}/reconciliations/:reconciliationId/void`,
    ...superuserReportAccess,
    jsonMutationRoute(
      "Failed to void manual reconciliation.",
      (req) => `collection:billing-principal:reconciliation:${reconciliationId(req)}:void`,
      (req) => collectionService.voidBillingPrincipalReconciliation(
        req.user,
        targetId(req),
        revisionId(req),
        reconciliationId(req),
        req.body,
        requestId(req),
      ),
    ),
  );

  app.get(
    `${revisionPrefix}/reconciliations/:reconciliationId/history`,
    ...reportAccess,
    jsonRoute("Failed to load reconciliation history.", (req) =>
      collectionService.listBillingPrincipalReconciliationHistory(
        req.user,
        targetId(req),
        revisionId(req),
        reconciliationId(req),
      )),
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
