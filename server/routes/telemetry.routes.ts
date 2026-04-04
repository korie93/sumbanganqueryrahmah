import type { Express, RequestHandler } from "express";

type TelemetryRouteDeps = {
  reportWebVital: RequestHandler;
};

export function registerTelemetryRoutes(app: Express, deps: TelemetryRouteDeps) {
  app.post("/telemetry/web-vitals", deps.reportWebVital);
}
