import { SpanStatusCode, trace } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  readBooleanEnvFlag,
  readOptionalEnvString,
} from "../config/runtime-environment";
import { logger } from "../lib/logger";

const DEFAULT_OTLP_TRACE_ENDPOINT = "http://localhost:4318/v1/traces";
const SERVICE_NAME = "sumbanganqueryrahmah";
const SERVICE_VERSION = "1.0.0";
let telemetrySdk: NodeSDK | null = null;
let telemetryStarted = false;

function isTracingEnabled(): boolean {
  return readBooleanEnvFlag("OTEL_TRACING_ENABLED", false)
    || Boolean(readOptionalEnvString("OTEL_EXPORTER_OTLP_ENDPOINT"));
}

export function initializeTelemetry(): void {
  if (telemetryStarted || !isTracingEnabled()) {
    return;
  }

  telemetryStarted = true;
  const endpoint = readOptionalEnvString("OTEL_EXPORTER_OTLP_ENDPOINT")
    || DEFAULT_OTLP_TRACE_ENDPOINT;

  try {
    telemetrySdk = new NodeSDK({
      serviceName: SERVICE_NAME,
      traceExporter: new OTLPTraceExporter({
        url: endpoint,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    telemetrySdk.start();
    logger.info("OpenTelemetry tracing initialized", {
      event: "otel_tracing_initialized",
      serviceName: SERVICE_NAME,
      serviceVersion: SERVICE_VERSION,
      endpointConfigured: Boolean(endpoint),
    });
  } catch (error) {
    telemetrySdk = null;
    logger.error("OpenTelemetry tracing initialization failed", {
      event: "otel_tracing_initialization_failed",
      message: error instanceof Error ? error.message : "Unknown telemetry error",
    });
  }
}

export async function shutdownTelemetry(): Promise<void> {
  const sdk = telemetrySdk;
  telemetrySdk = null;
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
  } catch (error) {
    logger.warn("OpenTelemetry tracing shutdown failed", {
      event: "otel_tracing_shutdown_failed",
      message: error instanceof Error ? error.message : "Unknown telemetry shutdown error",
    });
  }
}

export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
export { SpanStatusCode };
