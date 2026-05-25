import { logger as defaultLogger } from "../lib/logger";
import { REDIS_UNAVAILABLE_WARNING_REPEAT_MS } from "../middleware/redis-rate-limit-store";

type LoggerLike = Pick<typeof defaultLogger, "info" | "warn">;

type RedisHealthClientLike = {
  connect: () => Promise<unknown>;
  on?: (event: string, listener: (error: unknown) => void) => unknown;
  ping: () => Promise<unknown>;
  quit?: () => Promise<unknown>;
};

type RedisHealthClientFactory = (options: {
  socket: { reconnectStrategy: (retries: number, cause?: Error) => number | false };
  url: string;
}) => RedisHealthClientLike;

export type RedisHealthMonitorTarget = {
  label: string;
  redisUrl: string | null | undefined;
};

type RedisHealthMonitorOptions = {
  createRedisClient?: RedisHealthClientFactory;
  intervalMs: number;
  logger?: LoggerLike;
  now?: () => number;
  targets: RedisHealthMonitorTarget[];
  warningRepeatMs?: number;
};

type MonitoredRedisEndpoint = {
  checkPromise: Promise<void> | null;
  client: RedisHealthClientLike | null;
  clientPromise: Promise<RedisHealthClientLike | null> | null;
  endpoint: string;
  labels: string[];
  lastWarningAt: number;
  redisUrl: string;
  unavailable: boolean;
};

const REDIS_HEALTH_RECONNECT_BASE_DELAY_MS = 500;
const REDIS_HEALTH_RECONNECT_MAX_DELAY_MS = 30_000;

let defaultRedisClientFactoryPromise: Promise<RedisHealthClientFactory> | null = null;

async function resolveDefaultRedisClientFactory(): Promise<RedisHealthClientFactory> {
  defaultRedisClientFactoryPromise ??= import("redis")
    .then((redisModule) => redisModule.createClient as unknown as RedisHealthClientFactory);

  return defaultRedisClientFactoryPromise;
}

function normalizeIntervalMs(intervalMs: number) {
  return Math.max(5_000, Math.trunc(Number(intervalMs) || 0));
}

function describeRedisEndpoint(redisUrl: string) {
  try {
    const parsed = new URL(redisUrl);
    const port = parsed.port ? `:${parsed.port}` : "";
    const databasePath = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${parsed.protocol}//${parsed.hostname}${port}${databasePath}`;
  } catch {
    return "configured-redis-endpoint";
  }
}

function buildTargets(targets: RedisHealthMonitorTarget[]): MonitoredRedisEndpoint[] {
  const byUrl = new Map<string, MonitoredRedisEndpoint>();

  for (const target of targets) {
    const redisUrl = String(target.redisUrl || "").trim();
    if (!redisUrl) {
      continue;
    }

    const label = String(target.label || "redis").trim() || "redis";
    const existing = byUrl.get(redisUrl);
    if (existing) {
      if (!existing.labels.includes(label)) {
        existing.labels.push(label);
      }
      continue;
    }

    byUrl.set(redisUrl, {
      checkPromise: null,
      client: null,
      clientPromise: null,
      endpoint: describeRedisEndpoint(redisUrl),
      labels: [label],
      lastWarningAt: 0,
      redisUrl,
      unavailable: false,
    });
  }

  return [...byUrl.values()].map((target) => ({
    ...target,
    labels: target.labels.sort(),
  }));
}

export function createRedisHealthReconnectStrategy(logger: LoggerLike = defaultLogger) {
  return (retries: number, cause?: Error) => {
    const normalizedRetries = Math.max(0, Math.trunc(Number(retries) || 0));
    const delayMs = Math.min(
      REDIS_HEALTH_RECONNECT_MAX_DELAY_MS,
      REDIS_HEALTH_RECONNECT_BASE_DELAY_MS * (2 ** Math.min(normalizedRetries, 6)),
    );

    logger.warn("Redis health monitor reconnect scheduled", {
      delayMs,
      error: cause instanceof Error ? cause.message : undefined,
      retries: normalizedRetries,
    });

    return delayMs;
  };
}

export class RedisHealthMonitor {
  private readonly createRedisClient: RedisHealthClientFactory | null;
  private readonly intervalMs: number;
  private readonly logger: LoggerLike;
  private readonly now: () => number;
  private readonly targets: MonitoredRedisEndpoint[];
  private readonly warningRepeatMs: number;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RedisHealthMonitorOptions) {
    this.createRedisClient = options.createRedisClient ?? null;
    this.intervalMs = normalizeIntervalMs(options.intervalMs);
    this.logger = options.logger ?? defaultLogger;
    this.now = options.now ?? Date.now;
    this.targets = buildTargets(options.targets);
    this.warningRepeatMs = Math.max(
      1,
      Math.trunc(Number(options.warningRepeatMs ?? REDIS_UNAVAILABLE_WARNING_REPEAT_MS)),
    );
  }

  get targetCount() {
    return this.targets.length;
  }

  start() {
    if (this.stopped || this.timer || this.targets.length === 0) {
      return;
    }

    void this.checkOnce();
    this.timer = setInterval(() => {
      void this.checkOnce();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  async checkOnce() {
    if (this.stopped || this.targets.length === 0) {
      return;
    }

    await Promise.all(this.targets.map((target) => this.checkTarget(target)));
  }

  async stop() {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await Promise.all(this.targets.map(async (target) => {
      const pendingClient = await (target.clientPromise?.catch(() => null) ?? null);
      const client = target.client ?? pendingClient;
      target.client = null;
      target.clientPromise = null;
      await client?.quit?.().catch(() => undefined);
    }));
  }

  private checkTarget(target: MonitoredRedisEndpoint) {
    if (target.checkPromise) {
      return target.checkPromise;
    }

    const checkPromise = this.runTargetCheck(target)
      .finally(() => {
        if (target.checkPromise === checkPromise) {
          target.checkPromise = null;
        }
      });
    target.checkPromise = checkPromise;
    return checkPromise;
  }

  private async runTargetCheck(target: MonitoredRedisEndpoint) {
    const client = await this.getClient(target);
    if (!client) {
      return;
    }

    try {
      await client.ping();
      if (target.unavailable) {
        this.logger.info("Redis health monitor target recovered", {
          endpoint: target.endpoint,
          labels: target.labels,
        });
      }
      target.unavailable = false;
      target.lastWarningAt = 0;
    } catch (error) {
      const clientToClose = target.client;
      target.client = null;
      void clientToClose?.quit?.().catch(() => undefined);
      this.logFailure(target, error);
    }
  }

  private async getClient(target: MonitoredRedisEndpoint) {
    if (this.stopped) {
      return null;
    }
    if (target.client) {
      return target.client;
    }

    if (!target.clientPromise) {
      const clientPromise = this.connect(target);
      target.clientPromise = clientPromise;
      void clientPromise
        .finally(() => {
          if (target.clientPromise === clientPromise) {
            target.clientPromise = null;
          }
        })
        .catch(() => undefined);
    }

    return target.clientPromise;
  }

  private async connect(target: MonitoredRedisEndpoint): Promise<RedisHealthClientLike | null> {
    let client: RedisHealthClientLike | null = null;
    try {
      const createRedisClient = this.createRedisClient ?? await resolveDefaultRedisClientFactory();
      client = createRedisClient({
        socket: {
          reconnectStrategy: createRedisHealthReconnectStrategy(this.logger),
        },
        url: target.redisUrl,
      });
      client.on?.("error", (error) => this.logFailure(target, error));
      await client.connect();
      if (this.stopped) {
        await client.quit?.().catch(() => undefined);
        return null;
      }

      target.client = client;
      return client;
    } catch (error) {
      await client?.quit?.().catch(() => undefined);
      this.logFailure(target, error);
      return null;
    }
  }

  private logFailure(target: MonitoredRedisEndpoint, error: unknown) {
    const now = this.now();
    if (target.unavailable && now - target.lastWarningAt < this.warningRepeatMs) {
      return;
    }

    target.unavailable = true;
    target.lastWarningAt = now;
    this.logger.warn("Redis health monitor target unavailable", {
      endpoint: target.endpoint,
      error: error instanceof Error ? error.message : "Unknown Redis failure",
      labels: target.labels,
    });
  }
}

export function startRedisHealthMonitor(options: RedisHealthMonitorOptions) {
  const monitor = new RedisHealthMonitor(options);
  monitor.start();
  return () => {
    void monitor.stop();
  };
}
