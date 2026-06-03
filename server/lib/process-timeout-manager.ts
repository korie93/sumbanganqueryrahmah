type ProcessTimeoutTarget = {
  kill(signal?: NodeJS.Signals): boolean;
};

type ProcessTimeoutExitTarget = ProcessTimeoutTarget & {
  once: (
    event: "close" | "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ) => unknown;
  removeListener?: (
    event: "close" | "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ) => unknown;
};

export type ProcessTimeoutChain = {
  cancel: (options?: { preserveHardTimeout?: boolean }) => void;
  cancelHardTimeout: () => void;
};

export type ProcessTimeoutChainOptions = {
  hardSignal?: NodeJS.Signals;
  hardTimeoutMs: number;
  onCleanExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onHardTimeout?: () => void;
  onKillError?: (signal: NodeJS.Signals, error: unknown) => void;
  onSoftTimeout?: () => void;
  process: ProcessTimeoutTarget;
  softSignal?: NodeJS.Signals;
  softTimeoutMs: number;
  watchExit?: boolean;
};

function clearTimer(timer: NodeJS.Timeout | null) {
  if (timer) {
    clearTimeout(timer);
  }
}

function canWatchProcessExit(process: ProcessTimeoutTarget): process is ProcessTimeoutExitTarget {
  return typeof (process as { once?: unknown }).once === "function";
}

export function createProcessTimeoutChain({
  hardSignal = "SIGKILL",
  hardTimeoutMs,
  onCleanExit,
  onHardTimeout,
  onKillError,
  onSoftTimeout,
  process,
  softSignal = "SIGTERM",
  softTimeoutMs,
  watchExit = false,
}: ProcessTimeoutChainOptions): ProcessTimeoutChain {
  let softTimer: NodeJS.Timeout | null = null;
  let hardTimer: NodeJS.Timeout | null = null;
  let exitTarget: ProcessTimeoutExitTarget | null = null;
  let exitListener: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;

  const cancelHardTimeout = () => {
    clearTimer(hardTimer);
    hardTimer = null;
  };

  const cancel = (options: { preserveHardTimeout?: boolean } = {}) => {
    clearTimer(softTimer);
    softTimer = null;
    if (!options.preserveHardTimeout) {
      cancelHardTimeout();
    }
    if (exitListener) {
      exitTarget?.removeListener?.("close", exitListener);
      exitTarget?.removeListener?.("exit", exitListener);
      exitTarget = null;
      exitListener = null;
    }
  };

  const scheduleHardTimeout = () => {
    if (hardTimeoutMs < 0 || hardTimer) {
      return;
    }

    hardTimer = setTimeout(() => {
      hardTimer = null;
      onHardTimeout?.();
      try {
        process.kill(hardSignal);
      } catch (error) {
        onKillError?.(hardSignal, error);
      }
    }, hardTimeoutMs);
    hardTimer.unref?.();
  };

  softTimer = setTimeout(() => {
    softTimer = null;
    onSoftTimeout?.();
    try {
      process.kill(softSignal);
    } catch (error) {
      onKillError?.(softSignal, error);
    }
    scheduleHardTimeout();
  }, Math.max(0, softTimeoutMs));
  softTimer.unref?.();

  if (watchExit && canWatchProcessExit(process)) {
    exitTarget = process;
    exitListener = (code, signal) => {
      cancel();
      onCleanExit?.(code, signal);
    };
    process.once("close", exitListener);
  }

  return {
    cancel,
    cancelHardTimeout,
  };
}
