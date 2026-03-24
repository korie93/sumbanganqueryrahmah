import os from "node:os";
import type { WorkerToMasterMessage } from "./worker-ipc";
import type { IpcCapableProcess } from "./runtime-monitor-types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((clamp(p, 0, 100) / 100) * (sorted.length - 1));
  return sorted[index];
}

export function roundMetric(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

export function getRamPercent(): number {
  const total = Number(os.totalmem() || 0);
  const free = Number(os.freemem() || 0);
  if (total <= 0) return 0;
  return roundMetric(((total - free) / total) * 100, 2);
}

export function sendWorkerMessage(
  ipcProcess: IpcCapableProcess,
  message: WorkerToMasterMessage,
) {
  if (typeof ipcProcess.send !== "function") return;
  ipcProcess.send(message);
}
