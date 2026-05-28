import { runtimeConfigValidation, type RuntimeConfigDiagnostic } from "../config/runtime";

export type StartupStage =
  | "booting"
  | "verifying-bcrypt"
  | "verifying-receipt-scanner"
  | "initializing-storage"
  | "registering-runtime"
  | "ready"
  | "failed";

export type StartupHealthSnapshot = {
  degraded: boolean;
  degradedServices: StartupHealthDegradedService[];
  failed: boolean;
  failureDetails: string | null;
  failureReason: string | null;
  ready: boolean;
  stage: StartupStage;
  startedAt: string;
  updatedAt: string;
  validation: {
    warningCount: number;
    warnings: RuntimeConfigDiagnostic[];
  };
};

export type StartupHealthDegradedService = {
  details: string | null;
  reason: string;
  service: string;
  updatedAt: string;
};

const state: {
  failed: boolean;
  failureDetails: string | null;
  failureReason: string | null;
  ready: boolean;
  stage: StartupStage;
  startedAt: string;
  updatedAt: string;
} = {
  failed: false,
  failureDetails: null,
  failureReason: null,
  ready: false,
  stage: "booting",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const degradedServices = new Map<string, StartupHealthDegradedService>();

function touch() {
  state.updatedAt = new Date().toISOString();
}

export function markStartupServiceDegraded(service: string, reason: string, details?: string) {
  const serviceName = String(service || "").trim();
  if (!serviceName) {
    return;
  }

  degradedServices.set(serviceName, {
    details: details ? String(details) : null,
    reason: String(reason || "SERVICE_DEGRADED"),
    service: serviceName,
    updatedAt: new Date().toISOString(),
  });
  touch();
}

export function clearStartupServiceDegraded(service: string) {
  const serviceName = String(service || "").trim();
  if (!serviceName) {
    return;
  }

  if (degradedServices.delete(serviceName)) {
    touch();
  }
}

export function markStartupStage(stage: StartupStage) {
  state.stage = stage;
  state.ready = stage === "ready";
  if (stage !== "failed") {
    state.failed = false;
    state.failureReason = null;
    state.failureDetails = null;
  }
  touch();
}

export function markStartupReady() {
  state.stage = "ready";
  state.ready = true;
  state.failed = false;
  state.failureReason = null;
  state.failureDetails = null;
  touch();
}

export function markStartupFailed(reason: string, details?: string) {
  state.stage = "failed";
  state.ready = false;
  state.failed = true;
  state.failureReason = String(reason || "STARTUP_FAILED");
  state.failureDetails = details ? String(details) : null;
  touch();
}

export function getStartupHealthSnapshot(): StartupHealthSnapshot {
  const degradedServiceSnapshots = Array.from(degradedServices.values())
    .sort((left, right) => left.service.localeCompare(right.service))
    .map((service) => ({ ...service }));

  return {
    degraded: degradedServiceSnapshots.length > 0,
    degradedServices: degradedServiceSnapshots,
    failed: state.failed,
    failureDetails: state.failureDetails,
    failureReason: state.failureReason,
    ready: state.ready,
    stage: state.stage,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    validation: {
      warningCount: runtimeConfigValidation.warningCount,
      warnings: runtimeConfigValidation.warnings.map((warning) => ({
        code: warning.code,
        envNames: [...warning.envNames],
        message: warning.message,
        severity: warning.severity,
      })),
    },
  };
}
