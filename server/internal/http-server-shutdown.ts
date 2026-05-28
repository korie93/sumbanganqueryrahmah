import type { Server } from "node:http";
import type { logger as defaultLogger } from "../lib/logger";

type ShutdownLogger = Pick<typeof defaultLogger, "warn">;
const IDLE_CONNECTION_SWEEP_MS = 50;

export function closeHttpServerForShutdown(params: {
  logger: ShutdownLogger;
  server: Server;
}): Promise<void> {
  const { logger, server } = params;

  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const closeIdleConnections = () => {
      try {
        server.closeIdleConnections?.();
      } catch (error) {
        logger.warn("HTTP idle connection close failed during graceful shutdown", {
          error,
        });
      }
    };
    const idleConnectionSweep = setInterval(closeIdleConnections, IDLE_CONNECTION_SWEEP_MS);
    idleConnectionSweep.unref();

    server.close((error) => {
      clearInterval(idleConnectionSweep);
      if (error) {
        logger.warn("HTTP server close reported an error during graceful shutdown", {
          error,
        });
      }
      resolve();
    });

    closeIdleConnections();
  });
}
