export type LoadSample = {
  ts: number;
  requestRate: number;
  latencyP95Ms: number;
  cpuPercent: number;
};

export type LoadTrendSnapshot = {
  requestRateMA: number;
  latencyMA: number;
  cpuMA: number;
  requestRateTrend: number;
  latencyTrend: number;
  cpuTrend: number;
  sustainedUpward: boolean;
  lastUpdatedAt: number | null;
};

type LoadPredictorOptions = {
  maxSamples?: number;
  shortWindowSec?: number;
  longWindowSec?: number;
  trendThreshold?: number;
  sustainedMs?: number;
};

export class LoadPredictor {
  private readonly maxSamples: number;
  private readonly shortWindowSec: number;
  private readonly longWindowSec: number;
  private readonly trendThreshold: number;
  private readonly sustainedMs: number;
  private readonly samples: Array<LoadSample | undefined>;
  private sampleCursor = 0;
  private sampleCount = 0;
  private lastSample: LoadSample | null = null;
  private sustainedSince: number | null = null;

  constructor(options?: LoadPredictorOptions) {
    this.maxSamples = Math.max(30, options?.maxSamples ?? 720);
    this.shortWindowSec = Math.max(10, options?.shortWindowSec ?? 30);
    this.longWindowSec = Math.max(this.shortWindowSec + 10, options?.longWindowSec ?? 90);
    this.trendThreshold = Math.max(0.05, options?.trendThreshold ?? 0.2);
    this.sustainedMs = Math.max(5_000, options?.sustainedMs ?? 30_000);
    this.samples = new Array<LoadSample | undefined>(this.maxSamples);
  }

  update(sample: LoadSample): LoadTrendSnapshot {
    this.samples[this.sampleCursor] = sample;
    this.sampleCursor = (this.sampleCursor + 1) % this.maxSamples;
    this.sampleCount = Math.min(this.sampleCount + 1, this.maxSamples);
    this.lastSample = sample;

    const snapshot = this.getSnapshot();
    const isUpward =
      snapshot.requestRateTrend >= this.trendThreshold &&
      snapshot.latencyTrend >= this.trendThreshold &&
      snapshot.cpuTrend >= this.trendThreshold;

    if (isUpward) {
      if (this.sustainedSince === null) this.sustainedSince = sample.ts;
    } else {
      this.sustainedSince = null;
    }

    const sustainedUpward =
      this.sustainedSince !== null &&
      sample.ts - this.sustainedSince >= this.sustainedMs;

    return {
      ...snapshot,
      sustainedUpward,
      lastUpdatedAt: sample.ts,
    };
  }

  getSnapshot(): LoadTrendSnapshot {
    const now = Date.now();
    const shortWindowStart = now - this.shortWindowSec * 1000;
    const longWindowStart = now - this.longWindowSec * 1000;
    const samples = this.getSamplesInOrder();

    const shortSamples = samples.filter((s) => s.ts >= shortWindowStart);
    const longSamples = samples.filter((s) => s.ts >= longWindowStart);

    const requestRateMA = average(shortSamples.map((s) => s.requestRate));
    const latencyMA = average(shortSamples.map((s) => s.latencyP95Ms));
    const cpuMA = average(shortSamples.map((s) => s.cpuPercent));

    const requestRateLong = average(longSamples.map((s) => s.requestRate));
    const latencyLong = average(longSamples.map((s) => s.latencyP95Ms));
    const cpuLong = average(longSamples.map((s) => s.cpuPercent));

    const requestRateTrend = relativeGrowth(requestRateLong, requestRateMA);
    const latencyTrend = relativeGrowth(latencyLong, latencyMA);
    const cpuTrend = relativeGrowth(cpuLong, cpuMA);

    const sustainedUpward =
      this.sustainedSince !== null &&
      now - this.sustainedSince >= this.sustainedMs;

    return {
      requestRateMA,
      latencyMA,
      cpuMA,
      requestRateTrend,
      latencyTrend,
      cpuTrend,
      sustainedUpward,
      lastUpdatedAt: this.lastSample?.ts ?? null,
    };
  }

  private getSamplesInOrder(): LoadSample[] {
    if (this.sampleCount === 0) {
      return [];
    }

    const samples: LoadSample[] = [];
    const oldestIndex =
      this.sampleCount === this.maxSamples
        ? this.sampleCursor
        : 0;

    for (let offset = 0; offset < this.sampleCount; offset += 1) {
      const sample = this.samples[(oldestIndex + offset) % this.maxSamples];
      if (sample) {
        samples.push(sample);
      }
    }
    return samples;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function relativeGrowth(base: number, current: number): number {
  if (base <= 0 && current <= 0) return 0;
  if (base <= 0) return 1;
  return (current - base) / base;
}

