import { runtimeConfig } from "../config/runtime";
import { createRedisRuntimeWsSharedBus } from "./redis-runtime-shared-bus";
import type { RuntimeWsSharedBus } from "./runtime-shared-bus";

export function createConfiguredRuntimeWsSharedBus(): RuntimeWsSharedBus | null {
  const { sharedBus } = runtimeConfig.websocket;
  if (sharedBus.provider !== "redis" || !sharedBus.redisUrl) {
    return null;
  }

  return createRedisRuntimeWsSharedBus({
    redisUrl: sharedBus.redisUrl,
  });
}
