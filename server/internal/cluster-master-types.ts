export type ClusterMasterLogger = {
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
};

export type ClusterMasterOrchestratorConfig = {
  scaleIntervalMs: number;
  lowLoadHoldMs: number;
  activeRequestsThreshold: number;
  lowReqRateThreshold: number;
  lowMemoryMode: boolean;
  preallocateMb: number;
  maxSpawnPerCycle: number;
  maxWorkers: number;
  minWorkers: number;
  initialWorkers: number;
  scaleCooldownMs: number;
  restartThrottleMs: number;
  maxRestartAttempts: number;
  restartFailureWindowMs: number;
  restartBlockMs: number;
};
