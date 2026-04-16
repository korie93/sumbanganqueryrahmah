import { z } from "zod";

export const CLIENT_ERROR_SOURCES = [
  "client.log",
  "error-boundary",
  "window.error",
  "window.unhandledrejection",
] as const;

export const clientErrorTelemetrySchema = z.object({
  message: z.string().trim().min(1).max(300),
  source: z.enum(CLIENT_ERROR_SOURCES),
  pagePath: z.string().trim().min(1).max(512).regex(/^\//, "Path must start with '/'."),
  errorName: z.string().trim().min(1).max(120).optional(),
  component: z.string().trim().min(1).max(120).optional(),
  boundaryKey: z.string().trim().min(1).max(120).optional(),
  reasonType: z.string().trim().min(1).max(64).optional(),
  ts: z.string().trim().min(1).max(64),
}).strict();

export type ClientErrorTelemetryPayload = z.infer<typeof clientErrorTelemetrySchema>;
