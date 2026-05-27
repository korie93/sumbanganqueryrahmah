import type { Server } from "http";
import type { AiSearchService } from "../services/ai-search.service";

type SearchInflightState = typeof globalThis & {
  __searchInflightMap?: Map<string, Promise<unknown>>;
};

type RuntimeGlueOptions = {
  server: Server;
  aiSearchService: Pick<AiSearchService, "clearSearchCache" | "disposeDebugState" | "sweepCaches">;
  attachGcObserver: () => void;
  attachProcessMessageHandlers: (options: { onGracefulShutdown: () => void }) => void;
  onGracefulShutdownMessage?: ((reason: string) => void) | undefined;
  startRuntimeLoops: (options: { clearSearchCache: () => void }) => void;
  stopRuntimeMonitor: () => void;
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
    onGracefulShutdownMessage,
    stopRuntimeMonitor,
  } = options;

  attachGcObserver();

  attachProcessMessageHandlers({
    onGracefulShutdown: () => {
      if (onGracefulShutdownMessage) {
        onGracefulShutdownMessage("IPC_GRACEFUL_SHUTDOWN");
        return;
      }
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 25_000).unref();
    },
  });

  startRuntimeLoops({
    clearSearchCache: () => aiSearchService.clearSearchCache(),
  });

  const cacheSweepHandle = setInterval(() => {
    aiSearchService.sweepCaches(Date.now());
  }, 30_000);

  cacheSweepHandle.unref();
  server.once("close", () => {
    clearInterval(cacheSweepHandle);
    aiSearchService.disposeDebugState();
    stopRuntimeMonitor();
  });
}
