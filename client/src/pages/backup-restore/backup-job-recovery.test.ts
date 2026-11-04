import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackupActiveJobCard } from "./BackupActiveJobCard";
import {
  buildBackupJobSessionScope,
  buildBackupJobRuntimeScope,
  createBackupJobRecoveryChannel,
  getBackupJobStatusLabel,
  isCurrentBackupJobSession,
  persistBackupJobRecovery,
  readBackupJobRecovery,
  resolveBackupJobDisplayState,
} from "./backup-job-recovery";
import type { BackupJobRecord } from "./types";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

function job(status: BackupJobRecord["status"]): BackupJobRecord {
  return {
    id: "job-1", status, type: "create", requestedBy: "owner", requestedAt: "2026-11-05T00:00:00Z",
    startedAt: null, finishedAt: null, backupId: null, backupName: null,
    queuePosition: 0, result: null, error: null,
  };
}

test("backup job tracking survives remount only for the same account and login activity", () => {
  const session = storage();
  const account = { id: "owner-id", username: "owner" };
  const scope = buildBackupJobSessionScope(account, "login-1");
  assert.ok(scope);
  const recovery = { scope, jobId: "job-1", handled: false };
  persistBackupJobRecovery(session, recovery);
  assert.deepEqual(readBackupJobRecovery(session, scope), recovery);
  // A separate reader models the section being recreated after navigation.
  assert.equal(readBackupJobRecovery(session, buildBackupJobSessionScope(account, "login-1"))?.jobId, "job-1");

  for (const nextScope of [
    buildBackupJobSessionScope({ id: "another-owner", username: "other" }, "login-1"),
    buildBackupJobSessionScope(account, "login-2"),
    null,
  ]) {
    persistBackupJobRecovery(session, recovery);
    assert.equal(readBackupJobRecovery(session, nextScope), null);
    assert.equal(session.values.size, 0, "Account changes, a new login and logout discard the old pointer");
  }
  assert.equal(buildBackupJobSessionScope(account, ""), null);
  assert.equal(buildBackupJobSessionScope(null, "login-1"), null);
});

test("unavailable or corrupt storage does not invent a tracked job", () => {
  const broken = {
    getItem() { throw new Error("Storage blocked"); },
    setItem() { throw new Error("Quota exceeded"); },
    removeItem() { throw new Error("Storage blocked"); },
  };
  assert.equal(readBackupJobRecovery(broken, "scope"), null);
  assert.doesNotThrow(() => persistBackupJobRecovery(broken, { scope: "scope", jobId: "job-1", handled: false }));
  for (const raw of [
    "{", "[]", '{"scope":"scope","jobId":"","handled":false}', "x".repeat(2049),
    '{"scope":"scope","jobId":"job-1","handled":false}' + " ".repeat(2048),
    '{"__proto__":{"scope":"scope","jobId":"job-1","handled":false}}',
    '{"scope":"scope","jobId":"job-1","handled":false,"__proto__":{"polluted":true}}',
    '{"scope":"scope","jobId":"job-1","handled":false,"constructor":{"prototype":{"polluted":true}}}',
  ]) {
    const session = storage();
    session.setItem("backup-job-tracking", raw);
    assert.equal(readBackupJobRecovery(session, "scope"), null);
    assert.equal(session.values.size, 0);
  }
});

test("a session without a login activity still rejects late responses after logout or account change", () => {
  const account = { id: "owner", username: "owner", sessionExpiresAt: "2026-11-05T01:00:00Z" };
  const captured = buildBackupJobRuntimeScope(account, "");
  assert.ok(captured);
  assert.equal(buildBackupJobSessionScope(account, ""), null, "Missing activity cannot create a durable recovery key");
  assert.equal(isCurrentBackupJobSession(captured, buildBackupJobRuntimeScope(account, "")), true);
  assert.equal(isCurrentBackupJobSession(captured, buildBackupJobRuntimeScope(null, "")), false);
  assert.equal(isCurrentBackupJobSession(captured, buildBackupJobRuntimeScope({ ...account, id: "other" }, "")), false);
  assert.equal(isCurrentBackupJobSession(captured, buildBackupJobRuntimeScope({ ...account, sessionExpiresAt: "2026-11-05T02:00:00Z" }, "")), false);
  assert.equal(isCurrentBackupJobSession(null, null), false, "Unavailable identity never authorizes a late response");
});

test("a replacement section receives a late queued ID only for its captured account and session", () => {
  const channel = createBackupJobRecoveryChannel();
  const scope = buildBackupJobRuntimeScope({ id: "owner", username: "owner" }, "login-1");
  assert.ok(scope);
  const received: string[] = [];
  const unsubscribeOld = channel.subscribe(scope, () => { received.push("old-section"); });
  unsubscribeOld();
  const unsubscribeNew = channel.subscribe(scope, (next) => { received.push(next.jobId); });
  channel.subscribe("another-account-and-session", () => { received.push("wrong-account"); });
  // The original POST completes only after the replacement section has mounted.
  channel.publish({ scope, jobId: "late-job", handled: false });
  assert.deepEqual(received, ["late-job"]);
  assert.equal(channel.read(scope)?.jobId, "late-job");
  assert.equal(channel.read("another-account-and-session"), null);
  unsubscribeNew();
  channel.publish({ scope, jobId: "next-job", handled: false });
  assert.deepEqual(received, ["late-job"], "Unsubscribed instances cannot update or republish");
});

test("a failed terminal-marker write removes an older unhandled pointer while memory retains the handled job", () => {
  const session = storage();
  const recovery = { scope: "owner-and-login", jobId: "job-1", handled: false };
  persistBackupJobRecovery(session, recovery);
  const noFurtherWrites = { ...session, setItem() { throw new Error("Quota exceeded"); } };
  const terminal = { ...recovery, handled: true };
  assert.equal(persistBackupJobRecovery(noFurtherWrites, terminal), false);
  assert.equal(readBackupJobRecovery(session, recovery.scope), null);
  const channel = createBackupJobRecoveryChannel();
  channel.publish(terminal);
  assert.equal(channel.read(recovery.scope)?.handled, true);
});

test("cached, failed and mismatched job responses remain unconfirmed until a fresh GET succeeds", () => {
  const resolve = (overrides: Partial<Parameters<typeof resolveBackupJobDisplayState>[0]> = {}) =>
    resolveBackupJobDisplayState({ jobId: "job-1", job: job("completed"), validated: false, failed: false, ...overrides });
  assert.equal(resolve(), "checking", "A cached terminal job must be revalidated after remount");
  assert.equal(resolve({ validated: true, failed: true }), "unknown");
  assert.equal(resolve({ validated: true, jobId: "new-job" }), "unknown", "A previous job response cannot settle a new job");
  assert.equal(resolve({ validated: true, job: undefined }), "unknown");
  assert.equal(resolve({ jobId: null }), "unknown");
  for (const status of ["queued", "running", "completed", "failed"] as const) {
    assert.equal(resolve({ validated: true, job: job(status) }), status);
  }
  assert.equal(getBackupJobStatusLabel("unknown"), "Status kerja belum disahkan");
  assert.equal(getBackupJobStatusLabel("checking"), "Menyemak status kerja");
});

test("a handled terminal job is retained for revalidation without replaying its completion notice", () => {
  const session = storage();
  const recovery = { scope: "owner-and-login", jobId: "job-1", handled: true };
  persistBackupJobRecovery(session, recovery);
  assert.deepEqual(readBackupJobRecovery(session, recovery.scope), recovery);
  assert.equal(resolveBackupJobDisplayState({
    jobId: recovery.jobId, job: job("completed"), validated: false, failed: false,
  }), "checking");
});

test("job recovery shows checking and a separate actionable failure without claiming completion", () => {
  const props = {
    activeBackupJob: undefined, activeBackupJobBusy: true,
    backupJobChecking: false, backupJobError: false, onRetry() {},
  };
  const checking = renderToStaticMarkup(createElement(BackupActiveJobCard, { ...props, backupJobState: "checking" }));
  assert.match(checking, /role="status"/);
  assert.match(checking, /Checking backup or restore job/);
  assert.doesNotMatch(checking, /job in progress|No active|Retry job status/);
  const failed = renderToStaticMarkup(createElement(BackupActiveJobCard, {
    ...props, backupJobState: "unknown", backupJobError: true,
  }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Could not check job status/);
  assert.match(failed, /Retry job status/);
  assert.doesNotMatch(failed, /job in progress|No active/);
  const queued = renderToStaticMarkup(createElement(BackupActiveJobCard, {
    ...props, activeBackupJob: job("queued"), backupJobState: "queued",
  }));
  assert.match(queued, /Backup job queued/);
  assert.match(queued, /Waiting in queue/);
  assert.doesNotMatch(queued, /Running in background/);
});
