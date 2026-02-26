import type {
  GovernanceStateName,
  PredictiveState,
  RecommendedAction,
  SeverityLevel,
  StrategyDecision,
  StrategyName,
  SystemSnapshot,
} from "../types";

type StrategyContext = {
  snapshot: SystemSnapshot;
  anomalySeverity: SeverityLevel;
  predictiveState: PredictiveState;
  governanceState: GovernanceStateName;
  stabilityAverage5m: number;
  lastThreeAnomalyOutcomes: SeverityLevel[];
};

type StrategyStats = {
  wins: number;
  plays: number;
};

const STRATEGY_ORDER: StrategyName[] = ["ADAPTIVE", "CONSERVATIVE", "AGGRESSIVE"];

export class StrategyEngine {
  private readonly strategyStats: Record<StrategyName, StrategyStats> = {
    CONSERVATIVE: { wins: 0, plays: 0 },
    AGGRESSIVE: { wins: 0, plays: 0 },
    ADAPTIVE: { wins: 0, plays: 0 },
  };

  private anomalyOutcomes: SeverityLevel[] = [];

  public evaluate(context: StrategyContext): {
    chosen: StrategyDecision;
    candidates: StrategyDecision[];
    winRates: Record<StrategyName, number>;
  } {
    const conservative = this.runConservative(context);
    const aggressive = this.runAggressive(context);
    const adaptive = this.runAdaptive(context, conservative, aggressive);

    const candidates = [conservative, aggressive, adaptive];
    const winRates = this.getWinRates();

    const scored = candidates.map((candidate) => {
      const winRateBoost = winRates[candidate.strategy] * 0.20;
      return {
        candidate,
        score: candidate.confidenceScore + winRateBoost,
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return STRATEGY_ORDER.indexOf(a.candidate.strategy) - STRATEGY_ORDER.indexOf(b.candidate.strategy);
    });

    return {
      chosen: scored[0].candidate,
      candidates,
      winRates,
    };
  }

  public recordOutcome(strategy: StrategyName, success: boolean) {
    const stats = this.strategyStats[strategy];
    stats.plays += 1;
    if (success) stats.wins += 1;
  }

  public recordAnomalyOutcome(severity: SeverityLevel) {
    this.anomalyOutcomes.push(severity);
    if (this.anomalyOutcomes.length > 30) {
      this.anomalyOutcomes = this.anomalyOutcomes.slice(this.anomalyOutcomes.length - 30);
    }
  }

  public getLastThreeOutcomes(): SeverityLevel[] {
    if (this.anomalyOutcomes.length <= 3) return [...this.anomalyOutcomes];
    return this.anomalyOutcomes.slice(this.anomalyOutcomes.length - 3);
  }

  private getWinRates(): Record<StrategyName, number> {
    return {
      CONSERVATIVE: this.computeWinRate("CONSERVATIVE"),
      AGGRESSIVE: this.computeWinRate("AGGRESSIVE"),
      ADAPTIVE: this.computeWinRate("ADAPTIVE"),
    };
  }

  private computeWinRate(strategy: StrategyName): number {
    const stats = this.strategyStats[strategy];
    if (stats.plays === 0) return 0.5;
    return stats.wins / stats.plays;
  }

  private runConservative(context: StrategyContext): StrategyDecision {
    if (context.anomalySeverity === "EMERGENCY") {
      return {
        strategy: "CONSERVATIVE",
        recommendedAction: "ENABLE_THROTTLE_MODE",
        confidenceScore: 0.72,
        reason: "Emergency detected; conservative strategy enables throttle first.",
      };
    }

    if (context.predictiveState === "PREEMPTIVE_DEGRADATION" || context.anomalySeverity === "CRITICAL") {
      return {
        strategy: "CONSERVATIVE",
        recommendedAction: "PAUSE_AI_QUEUE",
        confidenceScore: 0.66,
        reason: "High latency risk; conservative strategy pauses AI queue to protect stability.",
      };
    }

    if (context.anomalySeverity === "WARNING") {
      return {
        strategy: "CONSERVATIVE",
        recommendedAction: "ENABLE_THROTTLE_MODE",
        confidenceScore: 0.58,
        reason: "Warning state; conservative strategy applies mild traffic control.",
      };
    }

    return {
      strategy: "CONSERVATIVE",
      recommendedAction: "NONE",
      confidenceScore: 0.52,
      reason: "Normal state; conservative strategy keeps system unchanged.",
    };
  }

  private runAggressive(context: StrategyContext): StrategyDecision {
    if (context.anomalySeverity === "EMERGENCY" || context.predictiveState === "CRITICAL_IMMINENT") {
      return {
        strategy: "AGGRESSIVE",
        recommendedAction: "SELECTIVE_WORKER_RESTART",
        confidenceScore: 0.82,
        reason: "Critical imminent condition; aggressive strategy favors rapid worker reset.",
      };
    }

    if (context.anomalySeverity === "CRITICAL") {
      return {
        strategy: "AGGRESSIVE",
        recommendedAction: "REDUCE_WORKER_COUNT",
        confidenceScore: 0.74,
        reason: "Critical instability; aggressive strategy trims worker pressure quickly.",
      };
    }

    if (context.anomalySeverity === "WARNING") {
      return {
        strategy: "AGGRESSIVE",
        recommendedAction: "PAUSE_AI_QUEUE",
        confidenceScore: 0.61,
        reason: "Warning state with aggressive posture; AI queue is paused preemptively.",
      };
    }

    return {
      strategy: "AGGRESSIVE",
      recommendedAction: "NONE",
      confidenceScore: 0.48,
      reason: "Normal state; aggressive strategy does not force intervention.",
    };
  }

  private runAdaptive(
    context: StrategyContext,
    conservative: StrategyDecision,
    aggressive: StrategyDecision,
  ): StrategyDecision {
    const emergencyCount = context.lastThreeAnomalyOutcomes.filter((s) => s === "EMERGENCY").length;
    const criticalCount = context.lastThreeAnomalyOutcomes.filter((s) => s === "CRITICAL").length;
    const unstableTrend = emergencyCount > 0 || criticalCount >= 2 || context.stabilityAverage5m < 62;

    if (unstableTrend || context.predictiveState === "CRITICAL_IMMINENT") {
      return {
        strategy: "ADAPTIVE",
        recommendedAction: aggressive.recommendedAction,
        confidenceScore: Math.min(0.92, aggressive.confidenceScore + 0.08),
        reason: "Adaptive strategy selected aggressive mode due to instability trend in last outcomes.",
      };
    }

    if (context.stabilityAverage5m >= 80 && context.anomalySeverity === "NORMAL") {
      return {
        strategy: "ADAPTIVE",
        recommendedAction: "NONE",
        confidenceScore: 0.84,
        reason: "Adaptive strategy keeps no-op under strong 5-minute stability.",
      };
    }

    return {
      strategy: "ADAPTIVE",
      recommendedAction: conservative.recommendedAction,
      confidenceScore: Math.min(0.88, conservative.confidenceScore + 0.10),
      reason: "Adaptive strategy selected conservative mode for balanced recovery.",
    };
  }
}

export type { StrategyContext };

