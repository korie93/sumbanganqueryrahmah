import type { Server } from "http";
import type { AiSearchService } from "../services/ai-search.service";

type SearchInflightState = typeof globalThis & {
  __searchInflightMap?: Map<string, Promise<unknown>>;
};

type RuntimeGlueOptions = {
  server: Server;
  aiSearchService: Pick<AiSearchService, "clearSearchCache" | "sweepCaches">;
  attachGcObserver: () => void;
  attachProcessMessageHandlers: (options: { onGracefulShutdown: () => void }) => void;
  startRuntimeLoops: (options: { clearSearchCache: () => void }) => void;
  stopRuntimeMonitor: () => void;
  sweepAdaptiveRateState: (now: number) => void;
};

export function getSearchQueueLength(): number {
  return ((globalThis as SearchInflightState).__searchInflightMap)?.size ?? 0;
}

export function attachLocalRuntimeGlue(options: RuntimeGlueOptions) {
  const {
    server,
    aiSearchService,
    attachGcObserver,
    attachProcessMessageHandlers,
    startRuntimeLoops,
    stopRuntimeMonitor,
    sweepAdaptiveRateState,
  } = options;

  attachGcObserver();

  attachProcessMessageHandlers({
    onGracefulShutdown: () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 25_000).unref();
    },
  });

  startRuntimeLoops({
    clearSearchCache: () => aiSearchService.clearSearchCache(),
  });

  const cacheSweepHandle = setInterval(() => {
    const now = Date.now();
    sweepAdaptiveRateState(now);
    aiSearchService.sweepCaches(now);
  }, 30_000);

  cacheSweepHandle.unref();
  server.once("close", () => {
    clearInterval(cacheSweepHandle);
    stopRuntimeMonitor();
  });
}
