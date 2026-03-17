import { useCallback, useRef, useState, type MutableRefObject } from "react";
import {
  getPendingPasswordResetRequests,
  getSuperuserManagedUsers,
} from "@/lib/api";
import type {
  ManagedUser,
  PendingPasswordResetRequest,
} from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsManagedUserDataArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export function useSettingsManagedUserData({
  isMountedRef,
  toast,
}: UseSettingsManagedUserDataArgs) {
  const managedUsersRequestIdRef = useRef(0);
  const pendingResetRequestsRequestIdRef = useRef(0);

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [managedUsersLoading, setManagedUsersLoading] = useState(false);
  const [pendingResetRequests, setPendingResetRequests] = useState<PendingPasswordResetRequest[]>([]);
  const [pendingResetRequestsLoading, setPendingResetRequestsLoading] = useState(false);

  const loadManagedUsers = useCallback(async () => {
    const requestId = ++managedUsersRequestIdRef.current;
    setManagedUsersLoading(true);
    try {
      const response = await getSuperuserManagedUsers();
      const nextUsers = Array.isArray(response?.users) ? response.users : [];
      if (!isMountedRef.current || requestId !== managedUsersRequestIdRef.current) return nextUsers;
      setManagedUsers(nextUsers);
      return nextUsers;
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== managedUsersRequestIdRef.current) return [];
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Managed Users",
        description: parsed.message,
        variant: "destructive",
      });
      return [];
    } finally {
      if (!isMountedRef.current || requestId !== managedUsersRequestIdRef.current) return;
      setManagedUsersLoading(false);
    }
  }, [isMountedRef, toast]);

  const loadPendingResetRequests = useCallback(async () => {
    const requestId = ++pendingResetRequestsRequestIdRef.current;
    setPendingResetRequestsLoading(true);
    try {
      const response = await getPendingPasswordResetRequests();
      const nextRequests = Array.isArray(response?.requests) ? response.requests : [];
      if (!isMountedRef.current || requestId !== pendingResetRequestsRequestIdRef.current) {
        return nextRequests;
      }
      setPendingResetRequests(nextRequests);
      return nextRequests;
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== pendingResetRequestsRequestIdRef.current) {
        return [];
      }
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Reset Requests",
        description: parsed.message,
        variant: "destructive",
      });
      return [];
    } finally {
      if (!isMountedRef.current || requestId !== pendingResetRequestsRequestIdRef.current) return;
      setPendingResetRequestsLoading(false);
    }
  }, [isMountedRef, toast]);

  const refreshManagedUsersSection = useCallback(async () => {
    await loadManagedUsers();
  }, [loadManagedUsers]);

  const refreshPendingResetRequestsSection = useCallback(async () => {
    await loadPendingResetRequests();
  }, [loadPendingResetRequests]);

  return {
    loadManagedUsers,
    loadPendingResetRequests,
    managedUsers,
    managedUsersLoading,
    pendingResetRequests,
    pendingResetRequestsLoading,
    refreshManagedUsersSection,
    refreshPendingResetRequestsSection,
  };
}
