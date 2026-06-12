export type BackgroundQueueName = "email" | "audit" | "backup" | "cleanup" | "import";

export const BACKGROUND_QUEUE_NAMES: readonly BackgroundQueueName[] = [
  "email",
  "audit",
  "backup",
  "cleanup",
  "import",
] as const;

export type BackgroundQueueRedisSource =
  | "explicit"
  | "legacy"
  | "rate-limit"
  | "websocket"
  | "none";

export type BackgroundQueueConfig = {
  readonly cleanupRepeatMs: number;
  readonly enabled: boolean;
  readonly prefix: string;
  readonly redisSource: BackgroundQueueRedisSource;
  readonly redisUrl: string | null;
  readonly removeOnComplete: number;
  readonly removeOnFail: number;
};

type ResolveBackgroundQueueConfigParams = {
  readonly cleanupRepeatMs?: number | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly prefix?: string | undefined;
  readonly rateLimitRedisUrl?: string | null | undefined;
  readonly websocketRedisUrl?: string | null | undefined;
};

const DEFAULT_BACKGROUND_QUEUE_PREFIX = "sqr";
const DEFAULT_CLEANUP_REPEAT_MS = 6 * 60 * 60 * 1000;
const MIN_CLEANUP_REPEAT_MS = 60_000;
const DEFAULT_REMOVE_ON_COMPLETE = 100;
const DEFAULT_REMOVE_ON_FAIL = 50;

function readEnvString(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = String(env[name] || "").trim();
  return value || null;
}

function normalizeRedisUrl(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function resolveRedisUrl(params: ResolveBackgroundQueueConfigParams): {
  redisSource: BackgroundQueueRedisSource;
  redisUrl: string | null;
} {
  const env = params.env ?? process.env;
  const candidates: ReadonlyArray<{
    source: BackgroundQueueRedisSource;
    value: string | null;
  }> = [
    { source: "explicit", value: readEnvString(env, "SQR_QUEUE_REDIS_URL") },
    { source: "legacy", value: readEnvString(env, "REDIS_URL") },
    { source: "rate-limit", value: normalizeRedisUrl(params.rateLimitRedisUrl) },
    { source: "websocket", value: normalizeRedisUrl(params.websocketRedisUrl) },
  ];

  const resolved = candidates.find((candidate) => Boolean(candidate.value));
  return {
    redisSource: resolved?.source ?? "none",
    redisUrl: resolved?.value ?? null,
  };
}

export function resolveBackgroundQueueConfig(
  params: ResolveBackgroundQueueConfigParams = {},
): BackgroundQueueConfig {
  const resolved = resolveRedisUrl(params);
  const cleanupRepeatMs = Math.max(
    MIN_CLEANUP_REPEAT_MS,
    Math.trunc(params.cleanupRepeatMs ?? DEFAULT_CLEANUP_REPEAT_MS),
  );
  const prefix = String(params.prefix || DEFAULT_BACKGROUND_QUEUE_PREFIX).trim()
    || DEFAULT_BACKGROUND_QUEUE_PREFIX;

  return {
    cleanupRepeatMs,
    enabled: Boolean(resolved.redisUrl),
    prefix,
    redisSource: resolved.redisSource,
    redisUrl: resolved.redisUrl,
    removeOnComplete: DEFAULT_REMOVE_ON_COMPLETE,
    removeOnFail: DEFAULT_REMOVE_ON_FAIL,
  };
}
