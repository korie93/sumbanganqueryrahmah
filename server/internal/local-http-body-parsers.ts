import express, { type Express } from "express";
import { WEB_VITALS_TELEMETRY_PATHS } from "../routes/telemetry-route-constants";
import { CSP_REPORT_ENDPOINT_PATH } from "./local-http-security";

const CSP_REPORT_BODY_LIMIT = "8kb";
const WEB_VITALS_BODY_LIMIT = "4kb";

type LocalHttpBodyParserOptions = {
  collectionBodyLimit: string;
  defaultBodyLimit: string;
  importBodyLimit: string;
};

export function registerLocalHttpBodyParsers(app: Express, options: LocalHttpBodyParserOptions) {
  // Keep default parser small; enable larger payloads only for known import
  // and collection endpoints that need them.
  app.use("/api/imports", express.json({ limit: options.importBodyLimit }));
  app.use("/api/imports", express.urlencoded({ extended: true, limit: options.importBodyLimit }));
  app.use("/api/collection", express.json({ limit: options.collectionBodyLimit }));
  app.use("/api/collection", express.urlencoded({ extended: true, limit: options.collectionBodyLimit }));
  app.use(CSP_REPORT_ENDPOINT_PATH, express.json({
    limit: CSP_REPORT_BODY_LIMIT,
    type: ["application/csp-report", "application/reports+json", "application/json"],
  }));
  for (const telemetryPath of WEB_VITALS_TELEMETRY_PATHS) {
    app.use(telemetryPath, express.json({ limit: WEB_VITALS_BODY_LIMIT }));
  }
  app.use(express.json({ limit: options.defaultBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: options.defaultBodyLimit }));
}
