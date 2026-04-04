import type { MetricStatus } from "@/components/monitor/MetricPanel";
import type { MonitorHistory, MonitorSnapshot, SeriesPoint } from "@/hooks/useSystemMetrics";
import type { ChaosType } from "@/lib/api";

export type ChaosOption = {
  type: ChaosType;
  label: string;
  description: string;
  defaultMagnitude: number;
  defaultDurationMs: number;
};

export type MonitorMetricItem = {
  label: string;
  value: number;
  unit: string;
  description: string;
  status: MetricStatus;
  history: number[];
  decimals?: number;
};

export type MonitorMetricGroup = {
  title: string;
  description: string;
  items: MonitorMetricItem[];
};

export type MonitorChartSeries = {
  category: string;
  title: string;
  description: string;
  color: string;
  unit: string;
  data: SeriesPoint[];
};

export type AnomalyRow = {
  label: string;
  key: string;
  value: number;
  description: string;
};

export type CorrelationRow = {
  label: string;
  key: string;
  value: number;
  boostedKey: string;
  description: string;
};

export type SlopeRow = {
  key: string;
  label: string;
  value: number;
};

export type MonitorRollupSnapshot = Pick<
  MonitorSnapshot,
  "rollupRefreshPendingCount" | "rollupRefreshRetryCount" | "rollupRefreshOldestPendingAgeMs"
>;

export type MonitorRollupSummarySnapshot = Pick<
  MonitorSnapshot,
  | "rollupRefreshPendingCount"
  | "rollupRefreshRunningCount"
  | "rollupRefreshRetryCount"
  | "rollupRefreshOldestPendingAgeMs"
>;

export const CHAOS_OPTIONS: ChaosOption[] = [
  {
    type: "cpu_spike",
    label: "CPU Spike",
    description: "Simulate abrupt CPU pressure to validate throttling and overload behavior.",
    defaultMagnitude: 25,
    defaultDurationMs: 20000,
  },
  {
    type: "db_latency_spike",
    label: "DB Latency Spike",
    description: "Inject query slowdown to validate database protection and response impact.",
    defaultMagnitude: 450,
    defaultDurationMs: 20000,
  },
  {
    type: "ai_delay",
    label: "AI Delay",
    description: "Delay AI operations to validate queue handling and fail-rate resilience.",
    defaultMagnitude: 600,
    defaultDurationMs: 20000,
  },
  {
    type: "worker_crash",
    label: "Worker Crash",
    description: "Simulate worker loss to validate system stability under reduced capacity.",
    defaultMagnitude: 1,
    defaultDurationMs: 20000,
  },
  {
    type: "memory_pressure",
    label: "Memory Pressure",
    description: "Increase memory pressure to validate event-loop and runtime degradation handling.",
    defaultMagnitude: 18,
    defaultDurationMs: 20000,
  },
];

export type { MonitorHistory, MonitorSnapshot, SeriesPoint };
