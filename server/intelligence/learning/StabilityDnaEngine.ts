import { count, eq, sql } from "drizzle-orm";
import { systemStabilityPatterns } from "../../../shared/schema-postgres";
import { db } from "../../db-postgres";
import type { RecommendedAction, SeverityLevel, SystemSnapshot } from "../types";
import { logIntelligenceFailSafe } from "../intelligence-failsafe-logger";

type StabilityPatternInput = {
  metricSignature: string;
  hour: number;
  weekday: number;
  severity: SeverityLevel;
  actionTaken: RecommendedAction;
  durationMs: number;
};

export class StabilityDnaEngine {
  private ensurePromise: Promise<void> | null = null;

  public async ensureTable(): Promise<void> {
    if (this.ensurePromise) return this.ensurePromise;
    this.ensurePromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS system_stability_patterns (
          id BIGSERIAL PRIMARY KEY,
          metric_signature TEXT NOT NULL,
          hour INTEGER NOT NULL,
          weekday INTEGER NOT NULL,
          severity TEXT NOT NULL,
          action_taken TEXT NOT NULL,
          duration_ms BIGINT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_stability_patterns_signature_window
        ON system_stability_patterns (metric_signature, hour, weekday, severity)
      `);
    })().catch((error) => {
      this.ensurePromise = null;
      throw error;
    });
    return this.ensurePromise;
  }

  public buildMetricSignature(snapshot: SystemSnapshot): string {
    const cpu = Math.round(snapshot.cpuPercent / 10) * 10;
    const ram = Math.round(snapshot.ramPercent / 10) * 10;
    const p95 = Math.round(snapshot.p95LatencyMs / 100) * 100;
    const db = Math.round(snapshot.dbLatencyMs / 100) * 100;
    const ai = Math.round(snapshot.aiLatencyMs / 100) * 100;
    const queue = Math.round(snapshot.queueSize / 5) * 5;
    return `cpu:${cpu}|ram:${ram}|p95:${p95}|db:${db}|ai:${ai}|q:${queue}|mode:${snapshot.mode}`;
  }

  public async getMutationFactor(metricSignature: string): Promise<number> {
    try {
      await this.ensureTable();
      const rows = await db
        .select({ value: count() })
        .from(systemStabilityPatterns)
        .where(eq(systemStabilityPatterns.metricSignature, metricSignature));
      const patternCount = Number(rows[0]?.value ?? 0);
      if (patternCount > 5) return 0.85;
      return 1;
    } catch (error) {
      logIntelligenceFailSafe({
        engine: "StabilityDnaEngine",
        operation: "getMutationFactor",
        error,
      });
      return 1;
    }
  }

  public async recordPattern(input: StabilityPatternInput): Promise<void> {
    try {
      await this.ensureTable();
      await db.insert(systemStabilityPatterns).values({
        metricSignature: input.metricSignature,
        hour: input.hour,
        weekday: input.weekday,
        severity: input.severity,
        actionTaken: input.actionTaken,
        durationMs: Math.max(0, Math.round(input.durationMs)),
      });
    } catch (error) {
      logIntelligenceFailSafe({
        engine: "StabilityDnaEngine",
        operation: "recordPattern",
        error,
      });
      // Fail-safe: learning storage must never break runtime flow.
    }
  }
}

export type { StabilityPatternInput };

