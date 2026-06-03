import {
  Queue,
  QueueEvents,
  Worker,
  type ConnectionOptions,
  type JobsOptions,
} from "bullmq";
import { runtimeConfig } from "../config/runtime";
import { logger } from "../lib/logger";
import {
  BACKGROUND_QUEUE_NAMES,
  type BackgroundQueueConfig,
  type BackgroundQueueName,
  resolveBackgroundQueueConfig,
} from "./config";
import {
  buildBackgroundQueueHealthSnapshot,
  type BackgroundQueueHealthSnapshot,
} from "./health";
import { registerCleanupRepeatableJob } from "./scheduler";
import {
  processAuditJob,
  processBackupJob,
  processCleanupJob,
  processEmailJob,
} from "./workers";

type QueueMap = Record<BackgroundQueueName, Queue | null>;
type QueueEventsMap = Record<BackgroundQueueName, QueueEvents | null>;
type RuntimeWorker = Pick<Worker, "close" | "isRunning" | "on">;
type WorkerMap = Record<BackgroundQueueName, RuntimeWorker | null>;

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    delay: 1_000,
    type: "exponential",
  },
};
const REDIS_PASSWORD_OPTION = "password" as const;

function createEmptyMap<T>(): Record<BackgroundQueueName, T | null> {
  return {
    audit: null,
    backup: null,
    cleanup: null,
    email: null,
  };
}

function parseRedisDb(pathname: string): number | undefined {
  const dbText = pathname.replace(/^\//, "").trim();
  if (!dbText) {
    return undefined;
  }

  const db = Number.parseInt(dbText, 10);
  return Number.isInteger(db) && db >= 0 ? db : undefined;
}

function buildBullMqConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const connection: ConnectionOptions = {
    host: parsed.hostname,
    maxRetriesPerRequest: null,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
  };
  const db = parseRedisDb(parsed.pathname);

  if (parsed.username) {
    connection.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    connection[REDIS_PASSWORD_OPTION] = decodeURIComponent(parsed.password);
  }
  if (db !== undefined) {
    connection.db = db;
  }
  if (parsed.protocol === "rediss:") {
    connection.tls = {};
  }

  return connection;
}

export function resolveRuntimeBackgroundQueueConfig(): BackgroundQueueConfig {
  return resolveBackgroundQueueConfig({
    rateLimitRedisUrl: runtimeConfig.rateLimiting.store.redisUrl,
    websocketRedisUrl: runtimeConfig.websocket.sharedBus.redisUrl,
  });
}

export class BackgroundQueueRuntime {
  private connection: ConnectionOptions | null = null;
  private readonly queueEvents: QueueEventsMap = createEmptyMap<QueueEvents>();
  private readonly queues: QueueMap = createEmptyMap<Queue>();
  private readonly workers: WorkerMap = createEmptyMap<Worker>();
  private started = false;

  constructor(private readonly config: BackgroundQueueConfig) {}

  get configured(): boolean {
    return this.config.enabled;
  }

  getQueue(queueName: BackgroundQueueName): Queue | null {
    return this.queues[queueName];
  }

  async start(): Promise<void> {
    if (this.started || !this.config.enabled || !this.config.redisUrl) {
      this.started = true;
      return;
    }

    this.connection = buildBullMqConnectionOptions(this.config.redisUrl);

    try {
      for (const queueName of BACKGROUND_QUEUE_NAMES) {
        this.queues[queueName] = new Queue(queueName, {
          connection: this.connection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
          prefix: this.config.prefix,
        });
        this.queueEvents[queueName] = new QueueEvents(queueName, {
          connection: this.connection,
          prefix: this.config.prefix,
        });
      }

      this.workers.email = new Worker("email", processEmailJob, {
        connection: this.connection,
        prefix: this.config.prefix,
      }) as unknown as RuntimeWorker;
      this.workers.audit = new Worker("audit", processAuditJob, {
        connection: this.connection,
        prefix: this.config.prefix,
      }) as unknown as RuntimeWorker;
      this.workers.backup = new Worker("backup", processBackupJob, {
        connection: this.connection,
        prefix: this.config.prefix,
      }) as unknown as RuntimeWorker;
      this.workers.cleanup = new Worker("cleanup", processCleanupJob, {
        connection: this.connection,
        prefix: this.config.prefix,
      }) as unknown as RuntimeWorker;

      this.bindWorkerLogs();

      const cleanupQueue = this.queues.cleanup;
      if (cleanupQueue) {
        await registerCleanupRepeatableJob(cleanupQueue, this.config);
      }

      this.started = true;
      logger.info("Background job queues started", {
        event: "background_queues_started",
        provider: "bullmq",
        source: this.config.redisSource,
      });
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async getHealthSnapshot(): Promise<BackgroundQueueHealthSnapshot> {
    return buildBackgroundQueueHealthSnapshot({
      configured: this.config.enabled,
      queues: this.queues,
      redisSource: this.config.redisSource,
      workers: this.workers,
    });
  }

  async close(): Promise<void> {
    const workers = BACKGROUND_QUEUE_NAMES
      .map((queueName) => this.workers[queueName])
      .filter((worker): worker is RuntimeWorker => Boolean(worker));
    const events = BACKGROUND_QUEUE_NAMES
      .map((queueName) => this.queueEvents[queueName])
      .filter((queueEvents): queueEvents is QueueEvents => Boolean(queueEvents));
    const queues = BACKGROUND_QUEUE_NAMES
      .map((queueName) => this.queues[queueName])
      .filter((queue): queue is Queue => Boolean(queue));

    await Promise.allSettled(workers.map((worker) => worker.close()));
    await Promise.allSettled(events.map((queueEvents) => queueEvents.close()));
    await Promise.allSettled(queues.map((queue) => queue.close()));

    for (const queueName of BACKGROUND_QUEUE_NAMES) {
      this.workers[queueName] = null;
      this.queueEvents[queueName] = null;
      this.queues[queueName] = null;
    }
    this.connection = null;
    this.started = false;
  }

  private bindWorkerLogs(): void {
    for (const queueName of BACKGROUND_QUEUE_NAMES) {
      const worker = this.workers[queueName];
      worker?.on("failed", (job, error) => {
        logger.error("Background queue job failed", {
          error,
          event: "background_queue_job_failed",
          name: job?.name,
          source: queueName,
        });
      });
      worker?.on("error", (error) => {
        logger.warn("Background queue worker error", {
          error,
          event: "background_queue_worker_error",
          source: queueName,
        });
      });
    }
  }
}

export function createBackgroundQueueRuntime(config = resolveRuntimeBackgroundQueueConfig()) {
  return new BackgroundQueueRuntime(config);
}
