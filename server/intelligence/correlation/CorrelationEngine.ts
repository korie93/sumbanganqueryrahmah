import type { CorrelationMatrix, CorrelationPair, SystemHistory } from "../types";
import { StatisticalEngine } from "../statistical/StatisticalEngine";

const BOOST_THRESHOLD = 0.6;
const BOOST_MULTIPLIER = 1.15;

export class CorrelationEngine {
  constructor(private readonly stats: StatisticalEngine) {}

  public evaluate(history: SystemHistory): { matrix: CorrelationMatrix; pairs: CorrelationPair[] } {
    const cpuToLatency = this.safeCorrelation(history.cpuPercent, history.p95LatencyMs);
    const dbToErrors = this.safeCorrelation(history.dbLatencyMs, history.errorRate);
    const aiToQueue = this.safeCorrelation(history.aiLatencyMs, history.queueSize);

    const pairs: CorrelationPair[] = [
      { pair: "CPU↔P95_LATENCY", coefficient: cpuToLatency, boosted: cpuToLatency > BOOST_THRESHOLD },
      { pair: "DB_LATENCY↔ERROR_RATE", coefficient: dbToErrors, boosted: dbToErrors > BOOST_THRESHOLD },
      { pair: "AI_LATENCY↔QUEUE_SIZE", coefficient: aiToQueue, boosted: aiToQueue > BOOST_THRESHOLD },
    ];

    return {
      matrix: {
        cpuToLatency,
        dbToErrors,
        aiToQueue,
        boostedPairs: pairs.filter((p) => p.boosted).map((p) => p.pair),
      },
      pairs,
    };
  }

  public applyBoost(baseScore: number, matrix: CorrelationMatrix): number {
    if (!Number.isFinite(baseScore)) return 0;
    if (matrix.boostedPairs.length === 0) return baseScore;
    return Math.min(1, baseScore * BOOST_MULTIPLIER);
  }

  private safeCorrelation(x: number[], y: number[]): number {
    try {
      return this.stats.computeCorrelation(x, y);
    } catch {
      return 0;
    }
  }
}

