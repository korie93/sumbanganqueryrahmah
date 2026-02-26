export class StatisticalEngine {
  private readonly maxSamples: number;

  constructor(maxSamples = 300) {
    this.maxSamples = Math.max(10, maxSamples);
  }

  public boundBuffer(values: number[]): number[] {
    if (!Array.isArray(values) || values.length === 0) return [];
    if (values.length <= this.maxSamples) return values.filter((v) => Number.isFinite(v));
    return values.slice(values.length - this.maxSamples).filter((v) => Number.isFinite(v));
  }

  public pushSample(values: number[], sample: number): number[] {
    if (!Number.isFinite(sample)) return this.boundBuffer(values);
    const next = [...this.boundBuffer(values), sample];
    if (next.length <= this.maxSamples) return next;
    return next.slice(next.length - this.maxSamples);
  }

  public computeMean(values: number[]): number {
    const bounded = this.boundBuffer(values);
    if (bounded.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < bounded.length; i += 1) sum += bounded[i];
    return sum / bounded.length;
  }

  public computeStdDev(values: number[]): number {
    const bounded = this.boundBuffer(values);
    if (bounded.length < 2) return 0;
    const mean = this.computeMean(bounded);
    let varianceSum = 0;
    for (let i = 0; i < bounded.length; i += 1) {
      const diff = bounded[i] - mean;
      varianceSum += diff * diff;
    }
    return Math.sqrt(varianceSum / bounded.length);
  }

  public computeZScore(value: number, mean: number, stdDev: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(stdDev) || stdDev === 0) {
      return 0;
    }
    return (value - mean) / stdDev;
  }

  public computeSlope(values: number[]): number {
    const bounded = this.boundBuffer(values);
    const n = bounded.length;
    if (n < 2) return 0;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i += 1) {
      const x = i + 1;
      const y = bounded[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = (n * sumXX) - (sumX * sumX);
    if (denominator === 0) return 0;
    return ((n * sumXY) - (sumX * sumY)) / denominator;
  }

  public computePercentile(values: number[], p: number): number {
    const bounded = this.boundBuffer(values);
    if (bounded.length === 0) return 0;
    const normalizedP = Math.max(0, Math.min(100, p));
    const rank = Math.floor((normalizedP / 100) * (bounded.length - 1));
    const copy = bounded.slice();
    return this.quickSelect(copy, rank);
  }

  public computeCorrelation(x: number[], y: number[]): number {
    const aligned = this.alignSeries(x, y);
    if (aligned.x.length < 2) return 0;

    const xMean = this.computeMean(aligned.x);
    const yMean = this.computeMean(aligned.y);

    let numerator = 0;
    let xVariance = 0;
    let yVariance = 0;

    for (let i = 0; i < aligned.x.length; i += 1) {
      const dx = aligned.x[i] - xMean;
      const dy = aligned.y[i] - yMean;
      numerator += dx * dy;
      xVariance += dx * dx;
      yVariance += dy * dy;
    }

    const denominator = Math.sqrt(xVariance * yVariance);
    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  public forecastNext(values: number[], steps = 2): number[] {
    const bounded = this.boundBuffer(values);
    const safeSteps = Math.max(1, Math.min(12, Math.floor(steps)));
    if (bounded.length === 0) return Array.from({ length: safeSteps }, () => 0);
    if (bounded.length === 1) return Array.from({ length: safeSteps }, () => bounded[0]);

    const slope = this.computeSlope(bounded);
    const mean = this.computeMean(bounded);
    const tail = bounded[bounded.length - 1];
    const momentum = (tail - mean) * 0.08;
    const forecast: number[] = [];

    for (let i = 1; i <= safeSteps; i += 1) {
      forecast.push(tail + (slope * i) + momentum);
    }
    return forecast;
  }

  private alignSeries(x: number[], y: number[]): { x: number[]; y: number[] } {
    const safeX = this.boundBuffer(x);
    const safeY = this.boundBuffer(y);
    const n = Math.min(safeX.length, safeY.length);
    if (n === 0) return { x: [], y: [] };
    return {
      x: safeX.slice(safeX.length - n),
      y: safeY.slice(safeY.length - n),
    };
  }

  private quickSelect(values: number[], targetIndex: number): number {
    let left = 0;
    let right = values.length - 1;

    while (left <= right) {
      const pivotIndex = this.partition(values, left, right);
      if (pivotIndex === targetIndex) return values[pivotIndex];
      if (pivotIndex < targetIndex) left = pivotIndex + 1;
      else right = pivotIndex - 1;
    }

    return values[Math.max(0, Math.min(values.length - 1, targetIndex))];
  }

  private partition(values: number[], left: number, right: number): number {
    const pivotIndex = Math.floor((left + right) / 2);
    const pivotValue = values[pivotIndex];
    [values[pivotIndex], values[right]] = [values[right], values[pivotIndex]];
    let store = left;

    for (let i = left; i < right; i += 1) {
      if (values[i] < pivotValue) {
        [values[i], values[store]] = [values[store], values[i]];
        store += 1;
      }
    }

    [values[store], values[right]] = [values[right], values[store]];
    return store;
  }
}

