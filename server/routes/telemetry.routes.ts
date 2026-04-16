import type { Express, RequestHandler } from "express";
import { routeHandler } from "../http/async-handler";

type TelemetryRouteDeps = {
  reportWebVital: RequestHandler;
  reportClientError: RequestHandler;
};

export function registerTelemetryRoutes(app: Express, deps: TelemetryRouteDeps) {
  app.post("/telemetry/web-vitals", routeHandler(deps.reportWebVital));
  app.post("/telemetry/client-errors", routeHandler(deps.reportClientError));
}
