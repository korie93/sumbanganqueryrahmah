export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type CircuitSnapshot = {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  rejections: number;
  totalRequests: number;
  failureRate: number;
  nextRetryAt: number | null;
  cooldownMs: number;
  threshold: number;
};

type CircuitOptions = {
  name: string;
  threshold?: number;
  minRequests?: number;
  cooldownMs?: number;
  halfOpenMaxInFlight?: number;
};

type CircuitOutcome = "failure" | "success" | "rejection";

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit '${name}' is OPEN`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private readonly name: string;
  private readonly threshold: number;
  private readonly minRequests: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMaxInFlight: number;
  private readonly maxWindow = 2_000;

  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private rejections = 0;
  private totalRequests = 0;
  private nextRetryAt: number | null = null;
  private halfOpenInFlight = 0;
  private readonly outcomes: CircuitOutcome[] = [];

  constructor(options: CircuitOptions) {
    this.name = options.name;
    this.threshold = Math.max(0.01, Math.min(1, options.threshold ?? 0.5));
    this.minRequests = Math.max(5, options.minRequests ?? 20);
    this.cooldownMs = Math.max(1_000, options.cooldownMs ?? 20_000);
    this.halfOpenMaxInFlight = Math.max(1, options.halfOpenMaxInFlight ?? 1);
  }

  getState(): CircuitState {
    this.evaluateCooldown();
    return this.state;
  }

  getSnapshot(): CircuitSnapshot {
    this.evaluateCooldown();
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      rejections: this.rejections,
      totalRequests: this.totalRequests,
      failureRate: this.totalRequests > 0 ? this.failures / this.totalRequests : 0,
      nextRetryAt: this.nextRetryAt,
      cooldownMs: this.cooldownMs,
      threshold: this.threshold,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.evaluateCooldown();

    if (this.state === "OPEN") {
      this.recordOutcome("rejection");
      throw new CircuitOpenError(this.name);
    }

    if (this.state === "HALF_OPEN" && this.halfOpenInFlight >= this.halfOpenMaxInFlight) {
      this.recordOutcome("rejection");
      throw new CircuitOpenError(this.name);
    }

    if (this.state === "HALF_OPEN") {
      this.halfOpenInFlight += 1;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      if (this.state === "HALF_OPEN" && this.halfOpenInFlight > 0) {
        this.halfOpenInFlight -= 1;
      }
    }
  }

  private onSuccess() {
    if (this.state === "HALF_OPEN") {
      this.close();
      return;
    }
    this.recordOutcome("success");
  }

  private onFailure() {
    this.recordOutcome("failure");

    if (this.state === "HALF_OPEN") {
      this.open();
      return;
    }

    if (this.totalRequests >= this.minRequests) {
      const failureRate = this.failures / this.totalRequests;
      if (failureRate >= this.threshold) {
        this.open();
        return;
      }
    }
  }

  private open() {
    this.state = "OPEN";
    this.nextRetryAt = Date.now() + this.cooldownMs;
    this.halfOpenInFlight = 0;
  }

  private close() {
    this.state = "CLOSED";
    this.nextRetryAt = null;
    this.halfOpenInFlight = 0;
    this.failures = 0;
    this.rejections = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.outcomes.length = 0;
  }

  private evaluateCooldown() {
    if (this.state !== "OPEN") return;
    if (this.nextRetryAt === null) return;
    if (Date.now() >= this.nextRetryAt) {
      this.state = "HALF_OPEN";
      this.nextRetryAt = null;
      this.halfOpenInFlight = 0;
    }
  }

  private recordOutcome(outcome: CircuitOutcome) {
    this.outcomes.push(outcome);
    this.incrementOutcome(outcome);

    while (this.outcomes.length > this.maxWindow) {
      const removed = this.outcomes.shift();
      if (removed) {
        this.decrementOutcome(removed);
      }
    }

    this.totalRequests = this.failures + this.successes + this.rejections;
  }

  private incrementOutcome(outcome: CircuitOutcome) {
    if (outcome === "failure") {
      this.failures += 1;
    } else if (outcome === "success") {
      this.successes += 1;
    } else {
      this.rejections += 1;
    }
  }

  private decrementOutcome(outcome: CircuitOutcome) {
    if (outcome === "failure") {
      this.failures = Math.max(0, this.failures - 1);
    } else if (outcome === "success") {
      this.successes = Math.max(0, this.successes - 1);
    } else {
      this.rejections = Math.max(0, this.rejections - 1);
    }
  }
}
