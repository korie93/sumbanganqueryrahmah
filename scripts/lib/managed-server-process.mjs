import { spawn } from "node:child_process";

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function hasManagedProcessExited(childProcess) {
  return !childProcess
    || childProcess.exitCode !== null
    || childProcess.signalCode !== null;
}

export function buildManagedServerSpawnOptions({
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
  stdio = ["ignore", "pipe", "pipe"],
} = {}) {
  return {
    cwd,
    detached: platform !== "win32",
    env,
    stdio,
  };
}

export function startManagedServerProcess(command, args, options = {}) {
  return spawn(command, args, buildManagedServerSpawnOptions(options));
}

async function waitForManagedProcessExit(
  childProcess,
  {
    sleepImpl = defaultSleep,
    timeoutMs,
  },
) {
  if (hasManagedProcessExited(childProcess)) {
    return true;
  }

  let onExit;
  const exited = await Promise.race([
    new Promise((resolve) => {
      onExit = () => resolve(true);
      childProcess.once("exit", onExit);
    }),
    sleepImpl(timeoutMs).then(() => false),
  ]).finally(() => {
    if (onExit) {
      childProcess.off("exit", onExit);
    }
  });

  return exited || hasManagedProcessExited(childProcess);
}

function destroyManagedProcessPipes(childProcess) {
  childProcess?.stdout?.destroy?.();
  childProcess?.stderr?.destroy?.();
}

function signalManagedProcessGroup(childProcess, signal, processKill) {
  const pid = Number(childProcess?.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    processKill(-pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return true;
    }
  }

  try {
    return childProcess.kill(signal);
  } catch {
    return false;
  }
}

export async function stopManagedServerProcess(childProcess, {
  forceTimeoutMs = 2_000,
  graceTimeoutMs = 5_000,
  platform = process.platform,
  processKill = process.kill,
  runCommand,
  sleepImpl = defaultSleep,
} = {}) {
  if (hasManagedProcessExited(childProcess)) {
    destroyManagedProcessPipes(childProcess);
    return;
  }

  if (platform === "win32") {
    if (typeof runCommand === "function") {
      await runCommand("taskkill", ["/pid", String(childProcess.pid), "/t", "/f"], {
        stdio: "ignore",
        allowFailure: true,
      });
    } else {
      childProcess.kill();
    }

    await waitForManagedProcessExit(childProcess, {
      sleepImpl,
      timeoutMs: forceTimeoutMs,
    });
    destroyManagedProcessPipes(childProcess);
    return;
  }

  signalManagedProcessGroup(childProcess, "SIGTERM", processKill);
  const exitedAfterTerminate = await waitForManagedProcessExit(childProcess, {
    sleepImpl,
    timeoutMs: graceTimeoutMs,
  });

  if (!exitedAfterTerminate) {
    signalManagedProcessGroup(childProcess, "SIGKILL", processKill);
    await waitForManagedProcessExit(childProcess, {
      sleepImpl,
      timeoutMs: forceTimeoutMs,
    });
  }

  destroyManagedProcessPipes(childProcess);
}
