import { percentile } from "./runtime-monitor-metrics";
import {
  blendRuntimeLatencyValue,
  decayRuntimeLatencyValue,
} from "./runtime-monitor-manager-utils";

type CreateRuntimeRequestTrackerOptions = {
  latencyWindow: number;
  aiLatencyStaleAfterMs: number;
  aiLatencyDecayHalfLifeMs: number;
};

export function createRuntimeRequestTracker({
  latencyWindow,
  aiLatencyStaleAfterMs,
  aiLatencyDecayHalfLifeMs,
}: CreateRuntimeRequestTrackerOptions) {
  let activeRequests = 0;
  const latencySamples: number[] = [];
  let requestCounter = 0;
  let requestRatePerSec = 0;
  let status401Window = 0;
  let status403Window = 0;
  let status429Window = 0;
  let status401Count = 0;
  let status403Count = 0;
  let status429Count = 0;
  let gcCountWindow = 0;
  let gcPerMinute = 0;
  let lastDbLatencyMs = 0;
  let lastAiLatencyMs = 0;
  let lastAiLatencyObservedAt = 0;

  function recordLatency(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    latencySamples.push(ms);
    if (latencySamples.length > latencyWindow) {
      latencySamples.splice(0, latencySamples.length - latencyWindow);
    }
  }

  function observeDbLatency(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    lastDbLatencyMs = blendRuntimeLatencyValue(lastDbLatencyMs, ms);
  }

  function observeAiLatency(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    lastAiLatencyMs = blendRuntimeLatencyValue(lastAiLatencyMs, ms);
    lastAiLatencyObservedAt = Date.now();
  }

  function getEffectiveAiLatencyMs(now = Date.now()) {
    return decayRuntimeLatencyValue({
      lastLatencyMs: lastAiLatencyMs,
      lastObservedAt: lastAiLatencyObservedAt,
      now,
      staleAfterMs: aiLatencyStaleAfterMs,
      halfLifeMs: aiLatencyDecayHalfLifeMs,
    });
  }

  function recordGcEntries(entryCount: number) {
    if (entryCount > 0) {
      gcCountWindow += entryCount;
    }
  }

  function recordRequestStarted() {
    activeRequests += 1;
    requestCounter += 1;
  }

  function recordRequestFinished(elapsedMs: number, statusCode = 0) {
    activeRequests = Math.max(0, activeRequests - 1);
    recordLatency(elapsedMs);
    if (statusCode === 401) {
      status401Window += 1;
    } else if (statusCode === 403) {
      status403Window += 1;
    } else if (statusCode === 429) {
      status429Window += 1;
    }
  }

  function rollFiveSecondWindow() {
    requestRatePerSec = requestCounter / 5;
    requestCounter = 0;
    status401Count = status401Window;
    status403Count = status403Window;
    status429Count = status429Window;
    status401Window = 0;
    status403Window = 0;
    status429Window = 0;
    gcPerMinute = gcCountWindow * 12;
    gcCountWindow = 0;
  }

  function getLatencyP95() {
    return percentile(latencySamples, 95);
  }

  function getActiveRequests() {
    return activeRequests;
  }

  function getRequestRate() {
    return requestRatePerSec;
  }

  function getLastDbLatencyMs() {
    return lastDbLatencyMs;
  }

  function getGcPerMinute() {
    return gcPerMinute;
  }

  function getStatusCounts() {
    return {
      status401Count,
      status403Count,
      status429Count,
    };
  }

  return {
    observeDbLatency,
    observeAiLatency,
    getEffectiveAiLatencyMs,
    recordGcEntries,
    recordRequestStarted,
    recordRequestFinished,
    rollFiveSecondWindow,
    getLatencyP95,
    getActiveRequests,
    getRequestRate,
    getLastDbLatencyMs,
    getGcPerMinute,
    getStatusCounts,
  };
}
