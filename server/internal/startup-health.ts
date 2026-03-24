import { runtimeConfigValidation, type RuntimeConfigDiagnostic } from "../config/runtime";

export type StartupStage =
  | "booting"
  | "initializing-storage"
  | "registering-runtime"
  | "ready"
  | "failed";

export type StartupHealthSnapshot = {
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

function touch() {
  state.updatedAt = new Date().toISOString();
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
  return {
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
