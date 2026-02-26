import type {
  AnomalyBreakdown,
  AnomalySummary,
  CorrelationMatrix,
  PredictiveResult,
  SeverityLevel,
  SystemHistory,
  SystemSnapshot,
} from "../types";
import { StatisticalEngine } from "../statistical/StatisticalEngine";

const WEIGHTS = {
  normalizedZScore: 0.30,
  slopeWeight: 0.20,
  percentileShift: 0.20,
  correlationWeight: 0.20,
  forecastRisk: 0.10,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export class AnomalyEngine {
  constructor(private readonly stats: StatisticalEngine) {}

  public evaluate(params: {
    snapshot: SystemSnapshot;
    history: SystemHistory;
    correlationMatrix: CorrelationMatrix;
    predictiveResult: PredictiveResult;
    mutationFactor: number;
  }): AnomalySummary {
    try {
      const { snapshot, history, correlationMatrix, predictiveResult } = params;
      const mutationFactor = Number.isFinite(params.mutationFactor) ? params.mutationFactor : 1;

      const mean = this.stats.computeMean(history.p95LatencyMs);
      const stdDev = this.stats.computeStdDev(history.p95LatencyMs);
      const zScore = this.stats.computeZScore(snapshot.p95LatencyMs, mean, stdDev);
      const normalizedZScore = clamp01(Math.abs(zScore) / 5);

      const slope = this.stats.computeSlope(history.p95LatencyMs);
      const slopeWeight = clamp01(Math.abs(slope) / 50);

      const p90 = this.stats.computePercentile(history.p95LatencyMs, 90);
      const p50 = this.stats.computePercentile(history.p95LatencyMs, 50);
      const baseline = Math.max(1, p90 - p50);
      const percentileShift = clamp01(Math.max(0, (snapshot.p95LatencyMs - p90) / baseline));

      const maxCorrelation = Math.max(
        0,
        correlationMatrix.cpuToLatency,
        correlationMatrix.dbToErrors,
        correlationMatrix.aiToQueue,
      );
      const correlationWeight = clamp01(maxCorrelation);

      const forecastRisk = this.computeForecastRisk(predictiveResult);

      const weightedBase =
        (WEIGHTS.normalizedZScore * normalizedZScore) +
        (WEIGHTS.slopeWeight * slopeWeight) +
        (WEIGHTS.percentileShift * percentileShift) +
        (WEIGHTS.correlationWeight * correlationWeight) +
        (WEIGHTS.forecastRisk * forecastRisk);

      const withMutation = weightedBase * clamp01(Math.max(0.1, mutationFactor));
      const boosted = correlationMatrix.boostedPairs.length > 0 ? Math.min(1, withMutation * 1.15) : withMutation;
      const score = clamp01(boosted);
      const severity = this.resolveSeverity(score);

      const breakdown: AnomalyBreakdown = {
        normalizedZScore,
        slopeWeight,
        percentileShift,
        correlationWeight,
        forecastRisk,
        mutationFactor: clamp01(mutationFactor),
        weightedScore: score,
      };

      return {
        score,
        severity,
        breakdown,
      };
    } catch {
      return this.failSafe();
    }
  }

  private computeForecastRisk(predictiveResult: PredictiveResult): number {
    if (predictiveResult.predictiveState === "CRITICAL_IMMINENT") return 1;
    if (predictiveResult.predictiveState === "PREEMPTIVE_DEGRADATION") return 0.65;
    return 0.1;
  }

  private resolveSeverity(score: number): SeverityLevel {
    if (score >= 0.85) return "EMERGENCY";
    if (score >= 0.65) return "CRITICAL";
    if (score >= 0.40) return "WARNING";
    return "NORMAL";
  }

  private failSafe(): AnomalySummary {
    return {
      score: 0,
      severity: "NORMAL",
      breakdown: {
        normalizedZScore: 0,
        slopeWeight: 0,
        percentileShift: 0,
        correlationWeight: 0,
        forecastRisk: 0,
        mutationFactor: 1,
        weightedScore: 0,
      },
    };
  }
}

