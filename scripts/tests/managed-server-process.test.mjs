import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  buildManagedServerSpawnOptions,
  hasManagedProcessExited,
  stopManagedServerProcess,
} from "../lib/managed-server-process.mjs";

class FakeProcess extends EventEmitter {
  constructor({ killed = false, pid = 1234 } = {}) {
    super();
    this.exitCode = null;
    this.killed = killed;
    this.pid = pid;
    this.signalCode = null;
    this.stderr = { destroyed: false, destroy() { this.destroyed = true; } };
    this.stdout = { destroyed: false, destroy() { this.destroyed = true; } };
    this.childKillSignals = [];
  }

  kill(signal) {
    this.childKillSignals.push(signal);
    return true;
  }

  exit(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

test("buildManagedServerSpawnOptions detaches managed server processes on POSIX only", () => {
  assert.equal(buildManagedServerSpawnOptions({ platform: "linux" }).detached, true);
  assert.equal(buildManagedServerSpawnOptions({ platform: "darwin" }).detached, true);
  assert.equal(buildManagedServerSpawnOptions({ platform: "win32" }).detached, false);
});

test("hasManagedProcessExited ignores the misleading killed flag until an exit is observed", () => {
  const childProcess = new FakeProcess({ killed: true });

  assert.equal(hasManagedProcessExited(childProcess), false);
  childProcess.exit(0);
  assert.equal(hasManagedProcessExited(childProcess), true);
});

test("stopManagedServerProcess escalates a POSIX server group that ignores SIGTERM", async () => {
  const childProcess = new FakeProcess({ killed: true, pid: 4321 });
  const signals = [];

  await stopManagedServerProcess(childProcess, {
    graceTimeoutMs: 0,
    forceTimeoutMs: 0,
    platform: "linux",
    processKill: (pid, signal) => {
      signals.push({ pid, signal });
    },
    sleepImpl: async () => {},
  });

  assert.deepEqual(signals, [
    { pid: -4321, signal: "SIGTERM" },
    { pid: -4321, signal: "SIGKILL" },
  ]);
  assert.equal(childProcess.stdout.destroyed, true);
  assert.equal(childProcess.stderr.destroyed, true);
});

test("stopManagedServerProcess avoids SIGKILL once the POSIX server exits", async () => {
  const childProcess = new FakeProcess({ pid: 2468 });
  const signals = [];

  await stopManagedServerProcess(childProcess, {
    graceTimeoutMs: 5_000,
    platform: "linux",
    processKill: (pid, signal) => {
      signals.push({ pid, signal });
      childProcess.exit(0, signal);
    },
  });

  assert.deepEqual(signals, [
    { pid: -2468, signal: "SIGTERM" },
  ]);
});

test("stopManagedServerProcess uses targeted taskkill for Windows process trees", async () => {
  const childProcess = new FakeProcess({ pid: 1357 });
  const commands = [];

  await stopManagedServerProcess(childProcess, {
    forceTimeoutMs: 0,
    platform: "win32",
    runCommand: async (command, args, options) => {
      commands.push({ command, args, options });
      childProcess.exit(0);
    },
  });

  assert.deepEqual(commands, [
    {
      command: "taskkill",
      args: ["/pid", "1357", "/t", "/f"],
      options: {
        allowFailure: true,
        stdio: "ignore",
      },
    },
  ]);
});
