shot;
  workerCount: number;
  maxWorkers: number;import cluster, { type Worker } from "node:cluster";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LoadPredictor, type LoadTrendSnapshot } from "./internal/loadPredictor";

type WorkerMetrics = {
  workerId: number;
  pid: number;
  cpuPercent: number;
  reqRate: number;
  latencyP95Ms: number;
  eventLoopLagMs: number;
  activeRequests: number;
  queueLength: number;
  heapUsedMB: number;
  heapTotalMB: number;
  oldSpaceMB: number;
  gcPerMin: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  ts: number;
  circuit: {
    ai: { state: string; failureRate: number };
    db: { state: string; failureRate: number };
    export: { state: string; failureRate: number };
  };
};

type WorkerControlState = {
  mode: "NORMAL" | "DEGRADED" | "PROTECTION";
  healthScore: number;
  dbProtection: boolean;
  rejectHeavyRoutes: boolean;
  throttleFactor: number;
  predictor: LoadTrendSnap
  queueLength: number;
  preAllocateMB: number;
  updatedAt: number;
  workers: Array<{
    workerId: number;
    pid: number;
    cpuPercent: number;
    reqRate: number;
    latencyP95Ms: number;
    eventLoopLagMs: number;
    activeRequests: number;
    heapUsedMB: number;
    oldSpaceMB: number;
    dbLatencyMs: number;
    aiLatencyMs: number;
    ts: number;
  }>;
  circuits: {
    aiOpenWorkers: number;
    dbOpenWorkers: number;
    exportOpenWorkers: number;
  };
};

type Aggregate = {
  cpuPercent: number;
  reqRate: number;
  p95: number;
  eventLoopLagMs: number;
  activeRequests: number;
  queueLength: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  heapUsedMB: number;
  oldSpaceMB: number;
};

const SCALE_INTERVAL_MS = 5_000;
const LOW_LOAD_HOLD_MS = 60_000;
const ACTIVE_REQUESTS_THRESHOLD = 80;
const LOW_REQ_RATE_THRESHOLD = 8;
const PREALLOCATE_MB = 64;
const MAX_SPAWN_PER_CYCLE = 1;

const predictor = new LoadPredictor({
  shortWindowSec: 30,
  longWindowSec: 90,
  trendThreshold: 0.2,
  sustainedMs: 30_000,
});

const workerMetrics = new Map<number, WorkerMetrics>();
const intentionalExits = new Set<number>();
const drainingWorkers = new Set<number>();
let lastBroadcast: WorkerControlState | null = null;
let lowLoadSince: number | null = null;
let mode: WorkerControlState["mode"] = "NORMAL";
let preAllocBuffer: Buffer | null = null;
let rollingRestartInProgress = false;

function round(value: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function getMaxWorkers() {
  return Math.max(1, os.cpus().length - 1);
}

function getMinWorkers() {
  return 1;
}

function getWorkers(): Worker[] {
  return Object.values(cluster.workers ?? {}).filter((w): w is Worker => Boolean(w));
}

function aggregateMetrics(): Aggregate {
  const samples = Array.from(workerMetrics.values());
  if (samples.length === 0) {
    return {
      cpuPercent: 0,
      reqRate: 0,
      p95: 0,
      eventLoopLagMs: 0,
      activeRequests: 0,
      queueLength: 0,
      dbLatencyMs: 0,
      aiLatencyMs: 0,
      heapUsedMB: 0,
      oldSpaceMB: 0,
    };
  }

  const cpuPercent = samples.reduce((s, x) => s + x.cpuPercent, 0) / samples.length;
  const reqRate = samples.reduce((s, x) => s + x.reqRate, 0);
  const p95 = samples.reduce((m, x) => Math.max(m, x.latencyP95Ms), 0);
  const eventLoopLagMs = samples.reduce((m, x) => Math.max(m, x.eventLoopLagMs), 0);
  const activeRequests = samples.reduce((s, x) => s + x.activeRequests, 0);
  const queueLength = samples.reduce((s, x) => s + x.queueLength, 0);
  const dbLatencyMs = samples.reduce((m, x) => Math.max(m, x.dbLatencyMs), 0);
  const aiLatencyMs = samples.reduce((m, x) => Math.max(m, x.aiLatencyMs), 0);
  const heapUsedMB = samples.reduce((s, x) => s + x.heapUsedMB, 0);
  const oldSpaceMB = samples.reduce((s, x) => s + x.oldSpaceMB, 0);

  return {
    cpuPercent: round(cpuPercent),
    reqRate: round(reqRate),
    p95: round(p95),
    eventLoopLagMs: round(eventLoopLagMs),
    activeRequests,
    queueLength,
    dbLatencyMs: round(dbLatencyMs),
    aiLatencyMs: round(aiLatencyMs),
    heapUsedMB: round(heapUsedMB),
    oldSpaceMB: round(oldSpaceMB),
  };
}

function computeHealthScore(agg: Aggregate, workers: number, maxWorkers: number): number {
  const cpuPenalty = Math.min(30, (agg.cpuPercent / 100) * 30);
  const dbPenalty = agg.dbLatencyMs > 0 ? Math.min(20, (agg.dbLatencyMs / 1000) * 20) : 0;
  const aiPenalty = agg.aiLatencyMs > 0 ? Math.min(10, (agg.aiLatencyMs / 1500) * 10) : 0;
  const lagPenalty = Math.min(10, (agg.eventLoopLagMs / 200) * 10);
  const queuePenalty = Math.min(10, agg.queueLength / 10);
  const workerPressure = maxWorkers > 0 ? workers / maxWorkers : 0;
  const workerPenalty = workerPressure > 0.85 ? (workerPressure - 0.85) * 40 : 0;
  const raw = 100 - cpuPenalty - dbPenalty - aiPenalty - lagPenalty - queuePenalty - workerPenalty;
  return Math.max(0, Math.min(100, round(raw)));
}

function buildControlState(agg: Aggregate, trend: LoadTrendSnapshot): WorkerControlState {
  const workers = getWorkers();
  const maxWorkers = getMaxWorkers();
  const healthScore = computeHealthScore(agg, workers.length, maxWorkers);

  let nextMode: WorkerControlState["mode"] = "NORMAL";
  if (healthScore < 50 || agg.dbLatencyMs > 1000) {
    nextMode = "PROTECTION";
  } else if (
    agg.cpuPercent > 70 ||
    agg.p95 > 600 ||
    agg.eventLoopLagMs > 120 ||
    trend.sustainedUpward
  ) {
    nextMode = "DEGRADED";
  }
  mode = nextMode;

  const rejectHeavyRoutes =
    nextMode === "PROTECTION" ||
    (workers.length >= maxWorkers && agg.cpuPercent > 85);

  let throttleFactor = 1;
  if (nextMode === "PROTECTION") throttleFactor = 0.4;
  else if (workers.length >= maxWorkers && agg.cpuPercent > 85) throttleFactor = 0.5;
  else if (nextMode === "DEGRADED") throttleFactor = 0.75;

  const sampleList = Array.from(workerMetrics.values()).map((m) => ({
    workerId: m.workerId,
    pid: m.pid,
    cpuPercent: round(m.cpuPercent),
    reqRate: round(m.reqRate),
    latencyP95Ms: round(m.latencyP95Ms),
    eventLoopLagMs: round(m.eventLoopLagMs),
    activeRequests: m.activeRequests,
    heapUsedMB: round(m.heapUsedMB),
    oldSpaceMB: round(m.oldSpaceMB),
    dbLatencyMs: round(m.dbLatencyMs),
    aiLatencyMs: round(m.aiLatencyMs),
    ts: m.ts,
  }));

  const circuits = {
    aiOpenWorkers: Array.from(workerMetrics.values()).filter((m) => m.circuit.ai.state === "OPEN").length,
    dbOpenWorkers: Array.from(workerMetrics.values()).filter((m) => m.circuit.db.state === "OPEN").length,
    exportOpenWorkers: Array.from(workerMetrics.values()).filter((m) => m.circuit.export.state === "OPEN").length,
  };

  return {
    mode: nextMode,
    healthScore,
    dbProtection: agg.dbLatencyMs > 1000 || nextMode === "PROTECTION",
    rejectHeavyRoutes,
    throttleFactor,
    predictor: trend,
    workerCount: workers.length,
    maxWorkers,
    queueLength: agg.queueLength,
    preAllocateMB: trend.sustainedUpward ? PREALLOCATE_MB : 0,
    updatedAt: Date.now(),
    workers: sampleList,
    circuits,
  };
}

function broadcastControl(control: WorkerControlState) {
  lastBroadcast = control;
  for (const worker of getWorkers()) {
    worker.send({ type: "control-state", payload: control });
  }
}

function spawnWorker(reason: string) {
  const workers = getWorkers();
  const maxWorkers = getMaxWorkers();
  if (workers.length >= maxWorkers) return false;
  const w = cluster.fork({ ...process.env, SQR_CLUSTER_WORKER: "1" });
  console.log(`🧩 Spawn worker#${w.id} (${reason})`);
  return true;
}

async function drainAndRestartWorker(worker: Worker, reason: string) {
  if (drainingWorkers.has(worker.id)) return;
  drainingWorkers.add(worker.id);
  intentionalExits.add(worker.id);
  worker.send({ type: "graceful-shutdown", reason });

  const timeout = setTimeout(() => {
    try {
      worker.kill();
    } catch {
      // ignore
    }
  }, 30_000);

  worker.once("exit", () => {
    clearTimeout(timeout);
    drainingWorkers.delete(worker.id);
  });
}

async function rollingRestartOne(reason: string) {
  if (rollingRestartInProgress) return;
  const workers = getWorkers().filter((w) => !drainingWorkers.has(w.id));
  if (workers.length <= getMinWorkers()) return;

  rollingRestartInProgress = true;
  try {
    let candidate = workers[0];
    let minActive = Number.MAX_SAFE_INTEGER;
    for (const w of workers) {
      const active = workerMetrics.get(w.id)?.activeRequests ?? 0;
      if (active < minActive) {
        minActive = active;
        candidate = w;
      }
    }
    await drainAndRestartWorker(candidate, reason);
  } finally {
    setTimeout(() => {
      rollingRestartInProgress = false;
    }, 10_000);
  }
}

function evaluateScale() {
  const workers = getWorkers();
  const maxWorkers = getMaxWorkers();
  const agg = aggregateMetrics();
  const trend = predictor.update({
    ts: Date.now(),
    requestRate: agg.reqRate,
    latencyP95Ms: agg.p95,
    cpuPercent: agg.cpuPercent,
  });

  // Predictive actions before overload.
  if (trend.sustainedUpward) {
    let spawned = 0;
    while (spawned < MAX_SPAWN_PER_CYCLE && workers.length + spawned < maxWorkers) {
      if (!spawnWorker("predictive-uptrend")) break;
      spawned += 1;
    }
    if (!preAllocBuffer) {
      preAllocBuffer = Buffer.alloc(PREALLOCATE_MB * 1024 * 1024);
    }
  } else if (preAllocBuffer && agg.cpuPercent < 55 && agg.reqRate < LOW_REQ_RATE_THRESHOLD) {
    preAllocBuffer = null;
  }

  // Reactive scale-up rules.
  const highLoad =
    agg.cpuPercent > 70 ||
    agg.p95 > 600 ||
    agg.activeRequests > ACTIVE_REQUESTS_THRESHOLD * Math.max(1, workers.length);
  if (highLoad) {
    spawnWorker("reactive-high-load");
  }

  // Scale-down rules.
  const lowLoad = agg.cpuPercent < 40 && agg.reqRate < LOW_REQ_RATE_THRESHOLD;
  if (lowLoad) {
    if (lowLoadSince === null) lowLoadSince = Date.now();
    const longEnough = Date.now() - lowLoadSince >= LOW_LOAD_HOLD_MS;
    if (longEnough && workers.length > getMinWorkers()) {
      rollingRestartOne("scale-down-low-load").catch(() => undefined);
      lowLoadSince = Date.now();
    }
  } else {
    lowLoadSince = null;
  }

  // Memory protection.
  const memoryPressure =
    agg.heapUsedMB > 0 &&
    agg.oldSpaceMB / Math.max(agg.heapUsedMB, 1) > 0.75 &&
    agg.heapUsedMB > 1024;
  if (memoryPressure) {
    rollingRestartOne("memory-pressure").catch(() => undefined);
  }

  const control = buildControlState(agg, trend);
  broadcastControl(control);
}

function wireWorker(worker: Worker) {
  worker.on("message", (msg: any) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "worker-metrics" && msg.payload) {
      const payload = msg.payload as WorkerMetrics;
      workerMetrics.set(worker.id, { ...payload, workerId: worker.id, pid: worker.process.pid ?? payload.pid });
      return;
    }
    if (msg.type === "worker-event" && msg.payload?.kind === "memory-pressure") {
      rollingRestartOne("worker-memory-pressure").catch(() => undefined);
    }
  });
}

function bootCluster() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const workerExec = path.join(__dirname, "index-local.js");

  cluster.setupPrimary({
    exec: workerExec,
  });

  const initialWorkers = 1;
  for (let i = 0; i < initialWorkers; i += 1) {
    const worker = cluster.fork({ ...process.env, SQR_CLUSTER_WORKER: "1" });
    wireWorker(worker);
  }

  cluster.on("online", (worker) => {
    wireWorker(worker);
    if (lastBroadcast) {
      worker.send({ type: "control-state", payload: lastBroadcast });
    }
  });

  cluster.on("exit", (worker, code, signal) => {
    workerMetrics.delete(worker.id);
    drainingWorkers.delete(worker.id);
    const intentional = intentionalExits.has(worker.id);
    if (intentional) {
      intentionalExits.delete(worker.id);
    } else {
      console.error(`❌ Worker#${worker.id} exited unexpectedly (code=${code}, signal=${signal}). Restarting...`);
      const w = cluster.fork({ ...process.env, SQR_CLUSTER_WORKER: "1" });
      wireWorker(w);
    }

    // Keep minimum worker availability.
    if (getWorkers().length < getMinWorkers()) {
      const w = cluster.fork({ ...process.env, SQR_CLUSTER_WORKER: "1" });
      wireWorker(w);
    }
  });

  setInterval(evaluateScale, SCALE_INTERVAL_MS);
  console.log(`🧠 Cluster master online. workers=${initialWorkers}/${getMaxWorkers()} (min=${getMinWorkers()})`);
}

if (cluster.isPrimary) {
  bootCluster();
} else {
  // In case this file is accidentally used as worker entry.
  await import("./index-local.js");
}
