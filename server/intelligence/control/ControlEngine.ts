import { GovernanceState } from "../governance/GovernanceEngine";
import type { GovernanceStateName, RecommendedAction, SeverityLevel } from "../types";
import { AdaptiveControlEngine } from "./AdaptiveControlEngine";

const ACTION_COOLDOWN_MS = 60_000;
export const AUTO_HEALING_ENABLED = false;

type ControlCallbacks = {
  reduceWorkerCount?: () => Promise<boolean> | boolean;
  enableThrottleMode?: () => Promise<boolean> | boolean;
  pauseAIQueue?: () => Promise<boolean> | boolean;
  triggerSelectiveWorkerRestart?: () => Promise<boolean> | boolean;
};

type ExecuteInput = {
  requestedAction: RecommendedAction;
  governanceState: GovernanceStateName;
  severity: SeverityLevel;
  predictiveState: "NORMAL" | "PREEMPTIVE_DEGRADATION" | "CRITICAL_IMMINENT";
};

type ExecuteResult = {
  action: RecommendedAction;
  executed: boolean;
  reason: string;
};

export class ControlEngine {
  private readonly adaptiveControl = new AdaptiveControlEngine();
  private readonly callbacks: ControlCallbacks;
  private readonly lastActionByKey = new Map<string, number>();
  private lastAction: RecommendedAction = "NONE";

  constructor(callbacks?: ControlCallbacks) {
    this.callbacks = callbacks || {};
  }

  public async execute(input: ExecuteInput, now = Date.now()): Promise<ExecuteResult> {
    const action = this.adaptiveControl.resolve({
      requestedAction: input.requestedAction,
      governanceState: input.governanceState,
      severity: input.severity,
      predictiveState: input.predictiveState,
    });

    if (action === "NONE") {
      return { action, executed: false, reason: "No action requested by adaptive control." };
    }

    if (!AUTO_HEALING_ENABLED) {
      return { action, executed: false, reason: "AUTO_HEALING_ENABLED is false." };
    }

    if (!this.isGovernanceAllowed(input.governanceState)) {
      return { action, executed: false, reason: "Governance state does not allow autonomous control." };
    }

    if (!this.passesCooldown(action, now)) {
      return { action, executed: false, reason: "Action is in cooldown window." };
    }

    if (!this.passesOscillationGuard(action, now)) {
      return { action, executed: false, reason: "Oscillation guard blocked rapid action flip." };
    }

    const executed = await this.executeAction(action);
    if (!executed) {
      return { action, executed: false, reason: "Control callback returned false." };
    }

    this.lastActionByKey.set(action, now);
    this.lastAction = action;
    return { action, executed: true, reason: "Action executed successfully." };
  }

  public async reduceWorkerCount(): Promise<boolean> {
    return this.runCallback(this.callbacks.reduceWorkerCount);
  }

  public async enableThrottleMode(): Promise<boolean> {
    return this.runCallback(this.callbacks.enableThrottleMode);
  }

  public async pauseAIQueue(): Promise<boolean> {
    return this.runCallback(this.callbacks.pauseAIQueue);
  }

  public async triggerSelectiveWorkerRestart(): Promise<boolean> {
    return this.runCallback(this.callbacks.triggerSelectiveWorkerRestart);
  }

  private isGovernanceAllowed(governanceState: GovernanceStateName): boolean {
    if (governanceState === GovernanceState.LOCKDOWN || governanceState === GovernanceState.FAIL_SAFE) return false;
    return (
      governanceState === GovernanceState.EXECUTED ||
      governanceState === GovernanceState.CONSENSUS_PENDING ||
      governanceState === GovernanceState.PROPOSED
    );
  }

  private passesCooldown(action: RecommendedAction, now: number): boolean {
    const last = this.lastActionByKey.get(action);
    if (!last) return true;
    return now - last >= ACTION_COOLDOWN_MS;
  }

  private passesOscillationGuard(action: RecommendedAction, now: number): boolean {
    if (this.lastAction === "NONE" || this.lastAction === action) return true;
    const last = this.lastActionByKey.get(this.lastAction);
    if (!last) return true;
    return now - last >= ACTION_COOLDOWN_MS;
  }

  private async executeAction(action: RecommendedAction): Promise<boolean> {
    switch (action) {
      case "REDUCE_WORKER_COUNT":
        return this.reduceWorkerCount();
      case "ENABLE_THROTTLE_MODE":
        return this.enableThrottleMode();
      case "PAUSE_AI_QUEUE":
        return this.pauseAIQueue();
      case "SELECTIVE_WORKER_RESTART":
        return this.triggerSelectiveWorkerRestart();
      default:
        return false;
    }
  }

  private async runCallback(callback?: () => Promise<boolean> | boolean): Promise<boolean> {
    if (!callback) return true;
    try {
      const result = await Promise.resolve(callback());
      return result !== false;
    } catch {
      return false;
    }
  }
}

export type { ControlCallbacks, ExecuteInput, ExecuteResult };

