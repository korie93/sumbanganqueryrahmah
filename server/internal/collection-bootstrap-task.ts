export type BootstrapTaskState = {
  ready: boolean;
  initPromise: Promise<void> | null;
};

export async function runBootstrapTask(
  state: BootstrapTaskState,
  task: () => Promise<void>,
): Promise<void> {
  if (state.ready) {
    return;
  }
  if (state.initPromise) {
    await state.initPromise;
    return;
  }

  state.initPromise = (async () => {
    await task();
    state.ready = true;
  })();

  try {
    await state.initPromise;
  } finally {
    state.initPromise = null;
  }
}
