import type { GovernanceStateName, PredictiveState, RecommendedAction, SeverityLevel } from "../types";

type AdaptiveControlInput = {
  requestedAction: RecommendedAction;
  governanceState: GovernanceStateName;
  severity: SeverityLevel;
  predictiveState: PredictiveState;
};

export class AdaptiveControlEngine {
  public resolve(input: AdaptiveControlInput): RecommendedAction {
    if (input.governanceState === "LOCKDOWN" || input.governanceState === "FAIL_SAFE") {
      return "NONE";
    }

    if (input.predictiveState === "CRITICAL_IMMINENT" && input.requestedAction === "NONE") {
      return "ENABLE_THROTTLE_MODE";
    }

    if (input.severity === "EMERGENCY" && input.requestedAction === "PAUSE_AI_QUEUE") {
      return "SELECTIVE_WORKER_RESTART";
    }

    return input.requestedAction;
  }
}

