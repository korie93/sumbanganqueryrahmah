import { logger } from "../lib/logger";
import { hasPgPoolPressure } from "../db-pool-monitor";
import { CircuitBreaker } from "./circuitBreaker";
import type { LocalCircuitSnapshots, RuntimeMonitorManagerOptions } from "./runtime-monitor-types";

type CreateRuntimeMonitorCircuitRuntimeOptions = {
  pool: RuntimeMonitorManagerOptions["pool"];
  pgPoolWarnCooldownMs: number;
  observeDbLatency: (ms: number) => void;
  observeAiLatency: (ms: number) => void;
};

export function createRuntimeMonitorCircuitRuntime({
  pool,
  pgPoolWarnCooldownMs,
  observeDbLatency,
  observeAiLatency,
}: CreateRuntimeMonitorCircuitRuntimeOptions) {
  let lastPgPoolWarningAt = 0;
  let lastPgPoolWarningSignature = "";

  const circuitAi = new CircuitBreaker({
    name: "ai",
    threshold: 0.4,
    minRequests: 10,
    cooldownMs: 8000,
  });
  const circuitDb = new CircuitBreaker({
    name: "db",
    threshold: 0.35,
    minRequests: 20,
    cooldownMs: 12000,
  });
  const circuitExport = new CircuitBreaker({
    name: "export",
    threshold: 0.4,
    minRequests: 8,
    cooldownMs: 15000,
  });

  function maybeWarnPgPoolPressure(source: string) {
    const total = Number(pool.totalCount || 0);
    const idle = Number(pool.idleCount || 0);
    const waiting = Number(pool.waitingCount || 0);
    const max = Number(pool.options?.max || 0);
    const hasPressure = hasPgPoolPressure({
      total,
      idle,
      waiting,
      max,
    });

    if (!hasPressure) {
      lastPgPoolWarningSignature = "";
      return;
    }

    const signature = `${total}:${idle}:${waiting}:${max}`;
    const now = Date.now();
    if (
      signature === lastPgPoolWarningSignature
      && now - lastPgPoolWarningAt < pgPoolWarnCooldownMs
    ) {
      return;
    }

    lastPgPoolWarningAt = now;
    lastPgPoolWarningSignature = signature;
    logger.warn("PostgreSQL pool pressure detected", { total, idle, waiting, max, source });
  }

  async function withDbCircuit<T>(operation: () => Promise<T>): Promise<T> {
    return circuitDb.execute(async () => {
      const start = Date.now();
      try {
        return await operation();
      } finally {
        observeDbLatency(Date.now() - start);
        maybeWarnPgPoolPressure("db-circuit");
      }
    });
  }

  async function withAiCircuit<T>(operation: () => Promise<T>): Promise<T> {
    return circuitAi.execute(async () => {
      const start = Date.now();
      try {
        return await operation();
      } finally {
        observeAiLatency(Date.now() - start);
      }
    });
  }

  async function withExportCircuit<T>(operation: () => Promise<T>): Promise<T> {
    return circuitExport.execute(operation);
  }

  function getLocalCircuitSnapshots(): LocalCircuitSnapshots {
    return {
      ai: circuitAi.getSnapshot(),
      db: circuitDb.getSnapshot(),
      export: circuitExport.getSnapshot(),
    };
  }

  function getCircuitState() {
    return {
      aiSnapshot: circuitAi.getSnapshot(),
      dbSnapshot: circuitDb.getSnapshot(),
      exportSnapshot: circuitExport.getSnapshot(),
      aiState: circuitAi.getState(),
      dbState: circuitDb.getState(),
      exportState: circuitExport.getState(),
    };
  }

  return {
    getCircuitState,
    getLocalCircuitSnapshots,
    withAiCircuit,
    withDbCircuit,
    withExportCircuit,
  };
}
