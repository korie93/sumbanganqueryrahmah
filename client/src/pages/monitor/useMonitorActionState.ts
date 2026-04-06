import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  autoHealRollupQueue,
  deleteOldAlertHistory,
  drainRollupQueue,
  injectChaos,
  rebuildCollectionRollups,
  retryRollupFailures,
  type ChaosType,
} from "@/lib/api";
import {
  isValidMonitorAlertRetentionWindow,
  parseMonitorChaosRequestInput,
  type MonitorQueueAction,
} from "@/pages/monitor/monitor-page-state-utils";

type UseMonitorActionStateOptions = {
  canInjectChaos: boolean;
  canDeleteAlertHistory: boolean;
  canManageRollups: boolean;
  chaosType: ChaosType;
  chaosMagnitude: string;
  chaosDurationMs: string;
  refreshNow: () => Promise<void>;
  onResetAlertPages: () => void;
};

export function useMonitorActionState({
  canInjectChaos,
  canDeleteAlertHistory,
  canManageRollups,
  chaosType,
  chaosMagnitude,
  chaosDurationMs,
  refreshNow,
  onResetAlertPages,
}: UseMonitorActionStateOptions) {
  const [chaosLoading, setChaosLoading] = useState(false);
  const [lastChaosMessage, setLastChaosMessage] = useState<string | null>(null);
  const [deleteAlertHistoryBusy, setDeleteAlertHistoryBusy] = useState(false);
  const [queueActionBusy, setQueueActionBusy] = useState<MonitorQueueAction | null>(null);
  const [lastQueueActionMessage, setLastQueueActionMessage] = useState<string | null>(null);
  const chaosRequestRef = useRef<AbortController | null>(null);
  const chaosInFlightRef = useRef(false);
  const deleteAlertHistoryRequestRef = useRef<AbortController | null>(null);
  const deleteAlertHistoryInFlightRef = useRef(false);
  const queueActionRequestRef = useRef<AbortController | null>(null);
  const queueActionInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const { toast } = useToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      chaosRequestRef.current?.abort();
      chaosRequestRef.current = null;
      chaosInFlightRef.current = false;
      deleteAlertHistoryRequestRef.current?.abort();
      deleteAlertHistoryRequestRef.current = null;
      deleteAlertHistoryInFlightRef.current = false;
      queueActionRequestRef.current?.abort();
      queueActionRequestRef.current = null;
      queueActionInFlightRef.current = false;
    };
  }, []);

  const handleDeleteOldAlertHistory = useCallback(async (olderThanDays: number) => {
    if (!canDeleteAlertHistory || deleteAlertHistoryInFlightRef.current) {
      return;
    }

    if (!isValidMonitorAlertRetentionWindow(olderThanDays)) {
      toast({
        variant: "destructive",
        title: "Invalid retention window",
        description: "Choose a valid age in days before deleting old alert history.",
      });
      return;
    }

    deleteAlertHistoryRequestRef.current?.abort();
    const controller = new AbortController();
    deleteAlertHistoryRequestRef.current = controller;
    deleteAlertHistoryInFlightRef.current = true;
    setDeleteAlertHistoryBusy(true);

    try {
      const result = await deleteOldAlertHistory(olderThanDays, { signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.ok) {
        onResetAlertPages();
        toast({
          title: "Old alert history deleted",
          description: `Removed ${result.data.deletedCount} resolved incidents older than ${result.data.olderThanDays} days.`,
        });
        await refreshNow();
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only superuser can delete old monitor alert history.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Cleanup failed",
        description: result.message || "Failed to delete old alert history.",
      });
    } finally {
      if (deleteAlertHistoryRequestRef.current === controller) {
        deleteAlertHistoryRequestRef.current = null;
      }
      deleteAlertHistoryInFlightRef.current = false;
      if (mountedRef.current) {
        setDeleteAlertHistoryBusy(false);
      }
    }
  }, [canDeleteAlertHistory, onResetAlertPages, refreshNow, toast]);

  const submitChaos = useCallback(async () => {
    if (!canInjectChaos || chaosInFlightRef.current) {
      return;
    }

    const parsedInput = parseMonitorChaosRequestInput(chaosMagnitude, chaosDurationMs);
    if (!parsedInput.ok) {
      toast({
        variant: "destructive",
        title: parsedInput.reason === "invalid-magnitude" ? "Invalid magnitude" : "Invalid duration",
        description: parsedInput.reason === "invalid-magnitude"
          ? "Magnitude must be a valid number."
          : "Duration must be a positive number in milliseconds.",
      });
      return;
    }

    chaosRequestRef.current?.abort();
    const controller = new AbortController();
    chaosRequestRef.current = controller;
    chaosInFlightRef.current = true;
    setChaosLoading(true);

    try {
      const result = await injectChaos({
        type: chaosType,
        magnitude: parsedInput.magnitude,
        durationMs: parsedInput.durationMs,
      }, { signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.success) {
        const message = `Injected ${chaosType}. Active chaos events: ${result.data.active.length}.`;
        setLastChaosMessage(message);
        toast({
          title: "Chaos injected",
          description: message,
        });
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only admin and superuser can inject chaos scenarios.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Chaos injection failed",
        description: result.message || "Request failed.",
      });
    } finally {
      if (chaosRequestRef.current === controller) {
        chaosRequestRef.current = null;
      }
      chaosInFlightRef.current = false;
      if (mountedRef.current) {
        setChaosLoading(false);
      }
    }
  }, [canInjectChaos, chaosDurationMs, chaosMagnitude, chaosType, toast]);

  const runRollupAction = useCallback(async (action: MonitorQueueAction) => {
    if (!canManageRollups || queueActionInFlightRef.current) {
      return;
    }

    queueActionRequestRef.current?.abort();
    const controller = new AbortController();
    queueActionRequestRef.current = controller;
    queueActionInFlightRef.current = true;
    setQueueActionBusy(action);

    try {
      const result = action === "drain"
        ? await drainRollupQueue({ signal: controller.signal })
        : action === "retry-failures"
          ? await retryRollupFailures({ signal: controller.signal })
          : action === "auto-heal"
            ? await autoHealRollupQueue({ signal: controller.signal })
            : await rebuildCollectionRollups({ signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }

      if (result.state === "ok" && result.data?.ok) {
        const message = result.data.message || "Rollup queue action completed.";
        setLastQueueActionMessage(message);
        toast({
          title: "Rollup queue updated",
          description: message,
        });
        await refreshNow();
        return;
      }

      if (result.state === "forbidden" || result.state === "unauthorized") {
        toast({
          variant: "destructive",
          title: "Permission denied",
          description: "Only superuser can control collection rollup recovery actions.",
        });
        return;
      }

      toast({
        variant: "destructive",
        title: "Rollup action failed",
        description: result.message || "Request failed.",
      });
    } finally {
      if (queueActionRequestRef.current === controller) {
        queueActionRequestRef.current = null;
      }
      queueActionInFlightRef.current = false;
      if (mountedRef.current) {
        setQueueActionBusy(null);
      }
    }
  }, [canManageRollups, refreshNow, toast]);

  return {
    chaosLoading,
    lastChaosMessage,
    deleteAlertHistoryBusy,
    queueActionBusy,
    lastQueueActionMessage,
    handleDeleteOldAlertHistory,
    submitChaos,
    runRollupAction,
  };
}
