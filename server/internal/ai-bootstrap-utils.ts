import { logger } from "../lib/logger";

export type BootstrapTaskState = {
  ready: boolean;
  initPromise: Promise<void> | null;
};

export function createBootstrapTaskState(): BootstrapTaskState {
  return {
    ready: false,
    initPromise: null,
  };
}

export async function runAiBootstrapTask(
  state: BootstrapTaskState,
  errorMessage: string,
  task: () => Promise<void>,
): Promise<void> {
  if (state.ready) return;
  if (state.initPromise) {
    await state.initPromise;
    return;
  }

  state.initPromise = (async () => {
    try {
      await task();
      state.ready = true;
    } catch (err: any) {
      logger.error(errorMessage, { error: err });
    }
  })();

  try {
    await state.initPromise;
  } finally {
    state.initPromise = null;
  }
}
