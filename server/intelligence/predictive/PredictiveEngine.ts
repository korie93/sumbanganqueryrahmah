import type { PredictiveResult, SystemHistory } from "../types";
import { StatisticalEngine } from "../statistical/StatisticalEngine";

type PredictiveConfig = {
  warningLatencyMs: number;
  criticalLatencyMs: number;
  projectionSteps: number;
};

const DEFAULT_CONFIG: PredictiveConfig = {
  warningLatencyMs: 800,
  criticalLatencyMs: 1200,
  projectionSteps: 3, // 5s polling * 3 = ~15 seconds
};

export class PredictiveEngine {
  private readonly config: PredictiveConfig;

  constructor(private readonly stats: StatisticalEngine, config?: Partial<PredictiveConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
    };
  }

  public evaluate(history: SystemHistory): PredictiveResult {
    const projection = this.stats.forecastNext(history.p95LatencyMs || [], this.config.projectionSteps);
    const maxProjectedLatencyMs = projection.reduce((max, value) => Math.max(max, value), 0);

    if (maxProjectedLatencyMs >= this.config.criticalLatencyMs) {
      return {
        predictiveState: "CRITICAL_IMMINENT",
        projection,
        maxProjectedLatencyMs,
      };
    }

    if (maxProjectedLatencyMs >= this.config.warningLatencyMs) {
      return {
        predictiveState: "PREEMPTIVE_DEGRADATION",
        projection,
        maxProjectedLatencyMs,
      };
    }

    return {
      predictiveState: "NORMAL",
      projection,
      maxProjectedLatencyMs,
    };
  }
}

