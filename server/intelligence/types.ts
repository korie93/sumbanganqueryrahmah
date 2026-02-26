export type GovernanceStateName =
  | "IDLE"
  | "PROPOSED"
  | "CONSENSUS_PENDING"
  | "EXECUTED"
  | "COOLDOWN"
  | "LOCKDOWN"
  | "FAIL_SAFE";

export type SeverityLevel = "NORMAL" | "WARNING" | "CRITICAL" | "EMERGENCY";

export type PredictiveState = "NORMAL" | "PREEMPTIVE_DEGRADATION" | "CRITICAL_IMMINENT";

export type StrategyName = "CONSERVATIVE" | "AGGRESSIVE" | "ADAPTIVE";

export type RecommendedAction =
  | "NONE"
  | "ENABLE_THROTTLE_MODE"
  | "PAUSE_AI_QUEUE"
  | "REDUCE_WORKER_COUNT"
  | "SELECTIVE_WORKER_RESTART";

export type ChaosType =
  | "cpu_spike"
  | "db_latency_spike"
  | "ai_delay"
  | "worker_crash"
  | "memory_pressure";

export type SystemSnapshot = {
  timestamp: number;
  score: number;
  mode: "NORMAL" | "DEGRADED" | "PROTECTION";
  cpuPercent: number;
  ramPercent: number;
  p95LatencyMs: number;
  errorRate: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  eventLoopLagMs: number;
  requestRate: number;
  activeRequests: number;
  queueSize: number;
  workerCount: number;
  maxWorkers: number;
  dbConnections: number;
  aiFailRate: number;
  bottleneckType: string;
};

export type SystemHistory = {
  cpuPercent: number[];
  p95LatencyMs: number[];
  dbLatencyMs: number[];
  errorRate: number[];
  aiLatencyMs: number[];
  queueSize: number[];
  ramPercent: number[];
  requestRate: number[];
  workerCount: number[];
};

export type AnomalyBreakdown = {
  normalizedZScore: number;
  slopeWeight: number;
  percentileShift: number;
  correlationWeight: number;
  forecastRisk: number;
  mutationFactor: number;
  weightedScore: number;
};

export type AnomalySummary = {
  score: number;
  severity: SeverityLevel;
  breakdown: AnomalyBreakdown;
};

export type CorrelationPair = {
  pair: string;
  coefficient: number;
  boosted: boolean;
};

export type CorrelationMatrix = {
  cpuToLatency: number;
  dbToErrors: number;
  aiToQueue: number;
  boostedPairs: string[];
};

export type PredictiveResult = {
  predictiveState: PredictiveState;
  projection: number[];
  maxProjectedLatencyMs: number;
};

export type StrategyDecision = {
  strategy: StrategyName;
  recommendedAction: RecommendedAction;
  confidenceScore: number;
  reason: string;
};

export type EvaluateSystemResult = {
  stabilityIndex: number;
  anomalySummary: AnomalySummary;
  recommendedAction: RecommendedAction;
  predictiveState: PredictiveState;
  governanceState: GovernanceStateName;
};

export type GovernanceTransitionLog = {
  from: GovernanceStateName;
  to: GovernanceStateName;
  reason: string;
  timestamp: number;
};

export type ExplainabilityReport = {
  anomalyBreakdown: AnomalyBreakdown;
  correlationMatrix: CorrelationMatrix;
  slopeValues: Record<string, number>;
  forecastProjection: number[];
  governanceState: GovernanceStateName;
  chosenStrategy: StrategyDecision;
  decisionReason: string;
};

