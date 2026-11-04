import { useCallback, useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBackupJob } from "@/lib/api";
import { getStoredActivityId, getStoredAuthenticatedUser } from "@/lib/auth-session";
import { getBrowserSessionStorage } from "@/lib/browser-storage";
import {
  backupJobRecoveryChannel,
  buildBackupJobRuntimeScope,
  buildBackupJobSessionScope,
  isCurrentBackupJobSession,
  persistBackupJobRecovery,
  readBackupJobRecovery,
  resolveBackupJobDisplayState,
  type BackupJobRecovery,
} from "./backup-job-recovery";
import { isBackupJobTerminal } from "./backup-state-utils";

function readRuntimeScope() {
  return buildBackupJobRuntimeScope(getStoredAuthenticatedUser(), getStoredActivityId());
}

export function useBackupJobRecovery() {
  const fallbackScope = useId();
  const account = getStoredAuthenticatedUser();
  const activityId = getStoredActivityId();
  const runtimeScope = buildBackupJobRuntimeScope(account, activityId);
  const sessionScope = buildBackupJobSessionScope(account, activityId);
  const scope = runtimeScope ?? fallbackScope;
  const [tracking, setTracking] = useState<BackupJobRecovery | null>(
    () => backupJobRecoveryChannel.read(runtimeScope) ?? readBackupJobRecovery(getBrowserSessionStorage(), sessionScope),
  );
  const currentTracking = tracking?.scope === scope ? tracking : null;
  const activeBackupJobId = currentTracking?.jobId ?? null;
  const isCurrentSession = useCallback(
    () => isCurrentBackupJobSession(runtimeScope, readRuntimeScope()),
    [runtimeScope],
  );

  useEffect(() => {
    setTracking(backupJobRecoveryChannel.read(runtimeScope) ?? readBackupJobRecovery(getBrowserSessionStorage(), sessionScope));
    return backupJobRecoveryChannel.subscribe(scope, (next) => {
      if (isCurrentSession()) setTracking(next);
    });
  }, [isCurrentSession, runtimeScope, scope, sessionScope]);

  const jobQuery = useQuery({
    queryKey: ["/api/backups/jobs", scope, activeBackupJobId],
    enabled: Boolean(activeBackupJobId),
    queryFn: async () => {
      const job = await getBackupJob(String(activeBackupJobId));
      if (!isCurrentSession()) throw new Error("Backup tracking session changed.");
      return job;
    },
    // Cached records are useful only after the existing GET confirms them again.
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => query.state.status === "error" || isBackupJobTerminal(query.state.data?.status) ? false : 2000,
  });
  const activeBackupJob = jobQuery.isFetchedAfterMount && !jobQuery.isError && isCurrentSession()
    && jobQuery.data?.id === activeBackupJobId ? jobQuery.data : undefined;
  const backupJobState = resolveBackupJobDisplayState({
    jobId: activeBackupJobId,
    job: activeBackupJob,
    validated: jobQuery.isFetchedAfterMount,
    failed: jobQuery.isError,
  });

  const saveTracking = useCallback((next: BackupJobRecovery) => {
    if (!isCurrentSession()) return;
    setTracking(next);
    if (sessionScope) persistBackupJobRecovery(getBrowserSessionStorage(), next);
    // Storage events do not fire in the document that wrote sessionStorage.
    // Notify a replacement section when an older instance receives a late POST.
    backupJobRecoveryChannel.publish(next);
  }, [isCurrentSession, sessionScope]);
  const trackBackupJob = useCallback((jobId: string) => {
    saveTracking({ scope, jobId, handled: false });
  }, [saveTracking, scope]);
  const markBackupJobHandled = useCallback((jobId: string) => {
    if (currentTracking?.jobId === jobId) saveTracking({ ...currentTracking, handled: true });
  }, [currentTracking, saveTracking]);

  return {
    activeBackupJob,
    activeBackupJobId,
    backupJobState,
    backupJobError: Boolean(activeBackupJobId) && jobQuery.isError,
    backupJobChecking: Boolean(activeBackupJobId) && jobQuery.isFetching,
    backupJobHandled: currentTracking?.handled ?? false,
    isCurrentSession,
    markBackupJobHandled,
    retryBackupJob: () => { void jobQuery.refetch(); },
    trackBackupJob,
  };
}
