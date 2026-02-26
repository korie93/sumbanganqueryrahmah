import { AnomalyEngine } from "./anomaly/AnomalyEngine";
import { ChaosEngine, type InjectChaosInput } from "./chaos/ChaosEngine";
import { ControlEngine, type ControlCallbacks } from "./control/ControlEngine";
import { CorrelationEngine } from "./correlation/CorrelationEngine";
import { GovernanceEngine } from "./governance/GovernanceEngine";
import { StabilityDnaEngine } from "./learning/StabilityDnaEngine";
import { PredictiveEngine } from "./predictive/PredictiveEngine";
import { StatisticalEngine } from "./statistical/StatisticalEngine";
import { StrategyEngine } from "./strategy/StrategyEngine";
import type {
  EvaluateSystemResult,
  ExplainabilityReport,
  RecommendedAction,
  SeverityLevel,
  SystemHistory,
  SystemSnapshot,
} from "./types";

type StabilitySample = {
  ts: number;
  stabilityIndex: number;
};

type ActiveIncident = {
  startedAt: number;
  metricSignature: string;
  severity: SeverityLevel;
  actionTaken: RecommendedAction;
};

const MAX_HISTORY = 300;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHistory(history: SystemHistory, stats: StatisticalEngine): SystemHistory {
  return {
    cpuPercent: stats.boundBuffer(history.cpuPercent || []).slice(-MAX_HISTORY),
    p95LatencyMs: stats.boundBuffer(history.p95LatencyMs || []).slice(-MAX_HISTORY),
    dbLatencyMs: stats.boundBuffer(history.dbLatencyMs || []).slice(-MAX_HISTORY),
    errorRate: stats.boundBuffer(history.errorRate || []).slice(-MAX_HISTORY),
    aiLatencyMs: stats.boundBuffer(history.aiLatencyMs || []).slice(-MAX_HISTORY),
    queueSize: stats.boundBuffer(history.queueSize || []).slice(-MAX_HISTORY),
    ramPercent: stats.boundBuffer(history.ramPercent || []).slice(-MAX_HISTORY),
    requestRate: stats.boundBuffer(history.requestRate || []).slice(-MAX_HISTORY),
    workerCount: stats.boundBuffer(history.workerCount || []).slice(-MAX_HISTORY),
  };
}

class IntelligenceEcosystem {
  private readonly stats = new StatisticalEngine(MAX_HISTORY);
  private readonly correlation = new CorrelationEngine(this.stats);
  private readonly predictive = new PredictiveEngine(this.stats);
  private readonly anomaly = new AnomalyEngine(this.stats);
  private readonly governance = new GovernanceEngine();
  private readonly strategy = new StrategyEngine();
  private readonly chaos = new ChaosEngine();
  private readonly dna = new StabilityDnaEngine();
  private control = new ControlEngine();

  private explainability: ExplainabilityReport = {
    anomalyBreakdown: {
      normalizedZScore: 0,
      slopeWeight: 0,
      percentileShift: 0,
      correlationWeight: 0,
      forecastRisk: 0,
      mutationFactor: 1,
      weightedScore: 0,
    },
    correlationMatrix: {
      cpuToLatency: 0,
      dbToErrors: 0,
      aiToQueue: 0,
      boostedPairs: [],
    },
    slopeValues: {},
    forecastProjection: [],
    governanceState: "IDLE",
    chosenStrategy: {
      strategy: "CONSERVATIVE",
      recommendedAction: "NONE",
      confidenceScore: 0.5,
      reason: "No evaluation yet.",
    },
    decisionReason: "No evaluation yet.",
  };

  private stabilitySamples: StabilitySample[] = [];
  private previousStabilityIndex = 100;
  private previousChosenStrategy: "CONSERVATIVE" | "AGGRESSIVE" | "ADAPTIVE" | null = null;
  private activeIncident: ActiveIncident | null = null;

  constructor() {
    void this.dna.ensureTable();
  }

  public setControlCallbacks(callbacks: ControlCallbacks) {
    this.control = new ControlEngine(callbacks);
  }

  public async evaluateSystem(snapshot: SystemSnapshot, history: SystemHistory): Promise<EvaluateSystemResult> {
    const normalizedHistory = normalizeHistory(history, this.stats);
    const chaosSnapshot = this.chaos.apply(snapshot);
    const signature = this.dna.buildMetricSignature(chaosSnapshot);
    const mutationFactor = await this.dna.getMutationFactor(signature);

    const correlationResult = this.correlation.evaluate(normalizedHistory);
    const predictiveResult = this.predictive.evaluate(normalizedHistory);
    const anomalySummary = this.anomaly.evaluate({
      snapshot: chaosSnapshot,
      history: normalizedHistory,
      correlationMatrix: correlationResult.matrix,
      predictiveResult,
      mutationFactor,
    });

    const stabilityIndex = clamp(100 - (anomalySummary.score * 100), 0, 100);
    this.pushStabilitySample(stabilityIndex, chaosSnapshot.timestamp);

    this.strategy.recordAnomalyOutcome(anomalySummary.severity);
    const strategyOutcome = this.strategy.evaluate({
      snapshot: chaosSnapshot,
      anomalySeverity: anomalySummary.severity,
      predictiveState: predictiveResult.predictiveState,
      governanceState: this.governance.getState(),
      stabilityAverage5m: this.getStabilityAverage5m(chaosSnapshot.timestamp),
      lastThreeAnomalyOutcomes: this.strategy.getLastThreeOutcomes(),
    });

    const governanceState = this.governance.update({
      severity: anomalySummary.severity,
      recommendedAction: strategyOutcome.chosen.recommendedAction,
      consensusApproved: anomalySummary.severity !== "NORMAL",
    });

    const controlResult = await this.control.execute({
      requestedAction: strategyOutcome.chosen.recommendedAction,
      governanceState,
      severity: anomalySummary.severity,
      predictiveState: predictiveResult.predictiveState,
    });

    if (this.previousChosenStrategy) {
      const success = stabilityIndex >= this.previousStabilityIndex;
      this.strategy.recordOutcome(this.previousChosenStrategy, success);
    }
    this.previousChosenStrategy = strategyOutcome.chosen.strategy;
    this.previousStabilityIndex = stabilityIndex;

    await this.updateIncidentLearning({
      snapshot: chaosSnapshot,
      severity: anomalySummary.severity,
      action: strategyOutcome.chosen.recommendedAction,
    });

    this.explainability = {
      anomalyBreakdown: anomalySummary.breakdown,
      correlationMatrix: correlationResult.matrix,
      slopeValues: {
        cpuSlope: this.stats.computeSlope(normalizedHistory.cpuPercent),
        latencySlope: this.stats.computeSlope(normalizedHistory.p95LatencyMs),
        dbSlope: this.stats.computeSlope(normalizedHistory.dbLatencyMs),
        aiSlope: this.stats.computeSlope(normalizedHistory.aiLatencyMs),
        errorSlope: this.stats.computeSlope(normalizedHistory.errorRate),
      },
      forecastProjection: predictiveResult.projection,
      governanceState,
      chosenStrategy: strategyOutcome.chosen,
      decisionReason: `${strategyOutcome.chosen.reason} Control: ${controlResult.reason}`,
    };

    return {
      stabilityIndex,
      anomalySummary,
      recommendedAction: strategyOutcome.chosen.recommendedAction,
      predictiveState: predictiveResult.predictiveState,
      governanceState,
    };
  }

  public getExplainability(): ExplainabilityReport {
    return this.explainability;
  }

  public injectChaos(input: InjectChaosInput) {
    const event = this.chaos.inject(input);
    return {
      injected: event,
      active: this.chaos.listActive(),
    };
  }

  private pushStabilitySample(stabilityIndex: number, now: number) {
    this.stabilitySamples.push({ ts: now, stabilityIndex });
    const boundary = now - (10 * 60_000);
    this.stabilitySamples = this.stabilitySamples.filter((sample) => sample.ts >= boundary);
  }

  private getStabilityAverage5m(now: number): number {
    const boundary = now - (5 * 60_000);
    const slice = this.stabilitySamples.filter((sample) => sample.ts >= boundary);
    if (slice.length === 0) return this.previousStabilityIndex;
    const sum = slice.reduce((acc, sample) => acc + sample.stabilityIndex, 0);
    return sum / slice.length;
  }

  private async updateIncidentLearning(params: {
    snapshot: SystemSnapshot;
    severity: SeverityLevel;
    action: RecommendedAction;
  }) {
    if (params.severity !== "NORMAL" && !this.activeIncident) {
      this.activeIncident = {
        startedAt: params.snapshot.timestamp,
        metricSignature: this.dna.buildMetricSignature(params.snapshot),
        severity: params.severity,
        actionTaken: params.action,
      };
      return;
    }

    if (params.severity !== "NORMAL" && this.activeIncident) {
      this.activeIncident.severity = this.maxSeverity(this.activeIncident.severity, params.severity);
      this.activeIncident.actionTaken = params.action;
      return;
    }

    if (params.severity === "NORMAL" && this.activeIncident) {
      const startedAt = this.activeIncident.startedAt;
      const now = params.snapshot.timestamp;
      const date = new Date(startedAt);
      await this.dna.recordPattern({
        metricSignature: this.activeIncident.metricSignature,
        hour: date.getHours(),
        weekday: date.getDay(),
        severity: this.activeIncident.severity,
        actionTaken: this.activeIncident.actionTaken,
        durationMs: Math.max(0, now - startedAt),
      });
      this.activeIncident = null;
    }
  }

  private maxSeverity(a: SeverityLevel, b: SeverityLevel): SeverityLevel {
    const rank: Record<SeverityLevel, number> = {
      NORMAL: 0,
      WARNING: 1,
      CRITICAL: 2,
      EMERGENCY: 3,
    };
    return rank[a] >= rank[b] ? a : b;
  }
}

const ecosystem = new IntelligenceEcosystem();

export async function evaluateSystem(snapshot: SystemSnapshot, history: SystemHistory): Promise<EvaluateSystemResult> {
  return ecosystem.evaluateSystem(snapshot, history);
}

export function getIntelligenceExplainability(): ExplainabilityReport {
  return ecosystem.getExplainability();
}

export function injectChaos(input: InjectChaosInput) {
  return ecosystem.injectChaos(input);
}

export function configureControlCallbacks(callbacks: ControlCallbacks) {
  ecosystem.setControlCallbacks(callbacks);
}

