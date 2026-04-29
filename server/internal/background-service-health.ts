import { logger } from "../lib/logger";
import {
  clearStartupServiceDegraded,
  markStartupServiceDegraded,
} from "./startup-health";

type BackgroundServiceHealthSignalOptions = {
  failureDetails: string;
  failureLogMessage: string;
  failureReason: string;
  service: string;
  start: () => Promise<void>;
};

export function startBackgroundServiceWithHealthSignal(
  options: BackgroundServiceHealthSignalOptions,
): void {
  void options.start()
    .then(() => {
      clearStartupServiceDegraded(options.service);
    })
    .catch((error) => {
      markStartupServiceDegraded(options.service, options.failureReason, options.failureDetails);
      logger.error(options.failureLogMessage, {
        error,
        service: options.service,
      });
    });
}
