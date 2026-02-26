import type {
  GovernanceStateName,
  GovernanceTransitionLog,
  RecommendedAction,
  SeverityLevel,
} from "../types";

export enum GovernanceState {
  IDLE = "IDLE",
  PROPOSED = "PROPOSED",
  CONSENSUS_PENDING = "CONSENSUS_PENDING",
  EXECUTED = "EXECUTED",
  COOLDOWN = "COOLDOWN",
  LOCKDOWN = "LOCKDOWN",
  FAIL_SAFE = "FAIL_SAFE",
}

type GovernanceUpdateInput = {
  severity: SeverityLevel;
  recommendedAction: RecommendedAction;
  consensusApproved?: boolean;
  manualReset?: boolean;
  failSafe?: boolean;
};

const COOLDOWN_MS = 60_000;
const LOCKDOWN_WINDOW_MS = 10 * 60_000;
const OSCILLATION_GUARD_MS = 5_000;

export class GovernanceEngine {
  private state: GovernanceState = GovernanceState.IDLE;
  private cooldownUntil = 0;
  private lastTransitionAt = 0;
  private emergencyEvents: number[] = [];
  private transitionLogs: GovernanceTransitionLog[] = [];

  public update(input: GovernanceUpdateInput, now = Date.now()): GovernanceStateName {
    this.recordEmergency(input.severity, now);
    this.pruneEmergencyWindow(now);

    if (input.failSafe === true) {
      this.transition(GovernanceState.FAIL_SAFE, "Fail-safe trigger received.", now);
      return this.state;
    }

    if (this.emergencyEvents.length >= 3) {
      this.transition(GovernanceState.LOCKDOWN, "Emergency threshold reached (3 in 10 minutes).", now);
      this.cooldownUntil = Math.max(this.cooldownUntil, now + COOLDOWN_MS);
      return this.state;
    }

    switch (this.state) {
      case GovernanceState.FAIL_SAFE: {
        if (input.manualReset === true) {
          this.transition(GovernanceState.COOLDOWN, "Manual reset from fail-safe.", now);
          this.cooldownUntil = now + COOLDOWN_MS;
        }
        return this.state;
      }
      case GovernanceState.LOCKDOWN: {
        if (input.manualReset === true && now >= this.cooldownUntil) {
          this.transition(GovernanceState.COOLDOWN, "Manual reset from lockdown.", now);
          this.cooldownUntil = now + COOLDOWN_MS;
        }
        return this.state;
      }
      case GovernanceState.IDLE: {
        if (this.shouldPropose(input)) {
          this.transition(GovernanceState.PROPOSED, "Action proposed from idle.", now);
        }
        return this.state;
      }
      case GovernanceState.PROPOSED: {
        if (!this.shouldPropose(input)) {
          this.transition(GovernanceState.IDLE, "Proposal cancelled due to stable condition.", now);
          return this.state;
        }
        this.transition(GovernanceState.CONSENSUS_PENDING, "Proposal accepted, waiting consensus.", now);
        return this.state;
      }
      case GovernanceState.CONSENSUS_PENDING: {
        if (!this.shouldPropose(input)) {
          this.transition(GovernanceState.IDLE, "Consensus abandoned due to stable condition.", now);
          return this.state;
        }
        if (input.consensusApproved === true) {
          this.transition(GovernanceState.EXECUTED, "Consensus approved.", now);
        }
        return this.state;
      }
      case GovernanceState.EXECUTED: {
        this.transition(GovernanceState.COOLDOWN, "Execution completed, entering cooldown.", now);
        this.cooldownUntil = now + COOLDOWN_MS;
        return this.state;
      }
      case GovernanceState.COOLDOWN: {
        if (now < this.cooldownUntil) return this.state;
        if (this.shouldPropose(input)) {
          this.transition(GovernanceState.PROPOSED, "Cooldown elapsed, new proposal required.", now);
        } else {
          this.transition(GovernanceState.IDLE, "Cooldown elapsed and stable.", now);
        }
        return this.state;
      }
      default:
        return this.state;
    }
  }

  public getState(): GovernanceStateName {
    return this.state;
  }

  public getCooldownRemainingMs(now = Date.now()): number {
    if (this.state !== GovernanceState.COOLDOWN && this.state !== GovernanceState.LOCKDOWN) return 0;
    return Math.max(0, this.cooldownUntil - now);
  }

  public getTransitionLogs(limit = 100): GovernanceTransitionLog[] {
    const safeLimit = Math.max(1, Math.min(500, limit));
    if (this.transitionLogs.length <= safeLimit) return [...this.transitionLogs];
    return this.transitionLogs.slice(this.transitionLogs.length - safeLimit);
  }

  private shouldPropose(input: GovernanceUpdateInput): boolean {
    return input.recommendedAction !== "NONE" && input.severity !== "NORMAL";
  }

  private recordEmergency(severity: SeverityLevel, now: number) {
    if (severity === "EMERGENCY") {
      this.emergencyEvents.push(now);
    }
  }

  private pruneEmergencyWindow(now: number) {
    const boundary = now - LOCKDOWN_WINDOW_MS;
    this.emergencyEvents = this.emergencyEvents.filter((ts) => ts >= boundary);
  }

  private transition(next: GovernanceState, reason: string, now: number) {
    if (next === this.state) return;
    if (!this.passesOscillationGuard(next, now)) return;

    const previous = this.state;
    this.state = next;
    this.lastTransitionAt = now;
    this.transitionLogs.push({
      from: previous,
      to: next,
      reason,
      timestamp: now,
    });

    if (this.transitionLogs.length > 500) {
      this.transitionLogs.splice(0, this.transitionLogs.length - 500);
    }
  }

  private passesOscillationGuard(next: GovernanceState, now: number): boolean {
    if (this.lastTransitionAt === 0) return true;
    if (now - this.lastTransitionAt >= OSCILLATION_GUARD_MS) return true;

    const guardedStates = new Set<GovernanceState>([
      GovernanceState.IDLE,
      GovernanceState.PROPOSED,
      GovernanceState.CONSENSUS_PENDING,
      GovernanceState.EXECUTED,
    ]);

    if (guardedStates.has(this.state) && guardedStates.has(next)) {
      return false;
    }

    return true;
  }
}

