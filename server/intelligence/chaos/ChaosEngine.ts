import crypto from "crypto";
import type { ChaosType, SystemSnapshot } from "../types";

type ChaosEvent = {
  id: string;
  type: ChaosType;
  magnitude: number;
  createdAt: number;
  expiresAt: number;
};

type InjectChaosInput = {
  type: ChaosType;
  magnitude?: number;
  durationMs?: number;
};

const DEFAULT_DURATION_MS = 20_000;
const MAX_DURATION_MS = 5 * 60_000;

const DEFAULT_MAGNITUDE: Record<ChaosType, number> = {
  cpu_spike: 25,
  db_latency_spike: 450,
  ai_delay: 600,
  worker_crash: 1,
  memory_pressure: 18,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class ChaosEngine {
  private events = new Map<string, ChaosEvent>();

  public inject(input: InjectChaosInput): ChaosEvent {
    const now = Date.now();
    const magnitude = Number.isFinite(input.magnitude as number)
      ? Number(input.magnitude)
      : DEFAULT_MAGNITUDE[input.type];
    const durationMs = clamp(
      Number.isFinite(input.durationMs as number) ? Number(input.durationMs) : DEFAULT_DURATION_MS,
      5_000,
      MAX_DURATION_MS,
    );

    const event: ChaosEvent = {
      id: crypto.randomUUID(),
      type: input.type,
      magnitude,
      createdAt: now,
      expiresAt: now + durationMs,
    };

    this.events.set(event.id, event);
    return event;
  }

  public apply(snapshot: SystemSnapshot): SystemSnapshot {
    this.cleanupExpired();
    if (this.events.size === 0) return snapshot;

    const next: SystemSnapshot = {
      ...snapshot,
    };

    for (const event of this.events.values()) {
      switch (event.type) {
        case "cpu_spike":
          next.cpuPercent = clamp(next.cpuPercent + event.magnitude, 0, 100);
          next.p95LatencyMs += event.magnitude * 2;
          break;
        case "db_latency_spike":
          next.dbLatencyMs = Math.max(0, next.dbLatencyMs + event.magnitude);
          next.p95LatencyMs += event.magnitude * 0.4;
          next.errorRate = clamp(next.errorRate + 1.5, 0, 100);
          break;
        case "ai_delay":
          next.aiLatencyMs = Math.max(0, next.aiLatencyMs + event.magnitude);
          next.queueSize = Math.max(0, next.queueSize + Math.ceil(event.magnitude / 120));
          next.aiFailRate = clamp(next.aiFailRate + 0.8, 0, 100);
          break;
        case "worker_crash": {
          const drop = Math.max(1, Math.floor(event.magnitude));
          next.workerCount = Math.max(1, next.workerCount - drop);
          next.p95LatencyMs += 80 * drop;
          next.activeRequests += 10 * drop;
          break;
        }
        case "memory_pressure":
          next.ramPercent = clamp(next.ramPercent + event.magnitude, 0, 100);
          next.eventLoopLagMs += event.magnitude * 1.5;
          break;
        default:
          break;
      }
    }

    next.score = clamp(next.score - 10, 0, 100);
    return next;
  }

  public listActive(now = Date.now()): ChaosEvent[] {
    this.cleanupExpired(now);
    return Array.from(this.events.values()).sort((a, b) => a.expiresAt - b.expiresAt);
  }

  public cleanupExpired(now = Date.now()) {
    for (const [id, event] of this.events.entries()) {
      if (event.expiresAt <= now) {
        this.events.delete(id);
      }
    }
  }
}

export type { ChaosEvent, InjectChaosInput };

