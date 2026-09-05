import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  checkCollectionNicknameAuth,
  getCollectionNicknameSession,
  loginCollectionNickname,
  setupCollectionNicknamePassword,
} from "@/lib/api";
import { getCollectionNicknameForcedChangeToast } from "@/pages/collection-report/collection-nickname-auth-feedback";
import {
  parseApiError,
} from "@/pages/collection/utils";
import type { NicknameDialogStep } from "@/pages/collection-report/types";
import {
  clearCollectionNicknameSessionStorage,
  getStoredCollectionNickname,
  persistCollectionNicknameSessionStorage,
} from "@/pages/collection-report/utils";
import {
  getCredentialPasswordPolicyMessage,
  isCredentialPasswordPolicyCompliant,
} from "@shared/password-policy";

interface UseCollectionNicknameAccessOptions {
  bypassesNicknameAccess: boolean;
  currentUsername: string;
  requiresNicknamePassword: boolean;
  role: string;
}

export function useCollectionNicknameAccess({
  bypassesNicknameAccess,
  currentUsername,
  requiresNicknamePassword,
  role,
}: UseCollectionNicknameAccessOptions) {
  const { toast } = useToast();
  const [staffNickname, setStaffNickname] = useState(() => {
    if (typeof window === "undefined" || bypassesNicknameAccess) return "";
    return getStoredCollectionNickname();
  });
  // Browser storage is only a nickname hint. Access belongs to the live server session.
  const [nicknameSessionVerified, setNicknameSessionVerified] = useState(false);
  const [nicknameReauthenticationRequired, setNicknameReauthenticationRequired] = useState(false);
  const [checkingNicknameSession, setCheckingNicknameSession] = useState(
    !bypassesNicknameAccess && requiresNicknamePassword,
  );
  const [nicknameDialogOpen, setNicknameDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<NicknameDialogStep>("nickname");
  const [nicknameInput, setNicknameInput] = useState(staffNickname);
  const [resolvedNickname, setResolvedNickname] = useState(staffNickname);
  const [nicknamePassword, setNicknamePassword] = useState("");
  const [confirmNicknamePassword, setConfirmNicknamePassword] = useState("");
  const [setupMode, setSetupMode] = useState<"first-time" | "forced-change">("first-time");
  const [verifiedNicknamePassword, setVerifiedNicknamePassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);
  const [submittingNicknameAuth, setSubmittingNicknameAuth] = useState(false);

  const canAccessCollection =
    bypassesNicknameAccess || Boolean(staffNickname && nicknameSessionVerified);

  const resetDialogFields = useCallback((nextNickname = staffNickname) => {
    setDialogStep("nickname");
    setNicknameInput(nextNickname);
    setResolvedNickname(nextNickname);
    setNicknamePassword("");
    setConfirmNicknamePassword("");
    setVerifiedNicknamePassword("");
    setSetupMode("first-time");
    setShowLoginPassword(false);
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
  }, [staffNickname]);

  const clearNicknameSession = useCallback(() => {
    clearCollectionNicknameSessionStorage();
    setStaffNickname("");
    setNicknameSessionVerified(false);
    setNicknameReauthenticationRequired(false);
    setVerifiedNicknamePassword("");
    setSetupMode("first-time");
    setShowLoginPassword(false);
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
  }, []);

  const applyNicknameSession = useCallback((nickname: string) => {
    const normalized = String(nickname || "").trim();
    if (!normalized) return;

    persistCollectionNicknameSessionStorage({
      nickname: normalized,
      username: currentUsername,
      role,
    });

    setStaffNickname(normalized);
    setNicknameSessionVerified(true);
    setNicknameReauthenticationRequired(false);
    setNicknameDialogOpen(false);
    setVerifiedNicknamePassword("");
    setSetupMode("first-time");
    setShowLoginPassword(false);
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
  }, [currentUsername, role]);

  const requestNicknameReauthentication = useCallback(() => {
    if (bypassesNicknameAccess || !requiresNicknamePassword) return;
    clearCollectionNicknameSessionStorage();
    // Keep the nickname and mounted save form while its password is rechecked.
    setNicknameSessionVerified(false);
    setNicknameReauthenticationRequired(true);
    resetDialogFields(staffNickname);
    setNicknameDialogOpen(true);
  }, [bypassesNicknameAccess, requiresNicknamePassword, resetDialogFields, staffNickname]);

  useEffect(() => {
    if (bypassesNicknameAccess || !requiresNicknamePassword) return;
    const controller = new AbortController();
    setCheckingNicknameSession(true);
    setNicknameSessionVerified(false);

    void getCollectionNicknameSession({ signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.nickname) {
          applyNicknameSession(response.nickname.nickname);
        } else {
          clearCollectionNicknameSessionStorage();
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        clearCollectionNicknameSessionStorage();
        toast({
          title: "Pengesahan Nickname Diperlukan",
          description: parseApiError(error),
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingNicknameSession(false);
      });

    return () => controller.abort();
  }, [applyNicknameSession, bypassesNicknameAccess, currentUsername, requiresNicknamePassword, role, toast]);

  useEffect(() => {
    if (bypassesNicknameAccess || !requiresNicknamePassword || checkingNicknameSession) return;
    if (!nicknameSessionVerified) {
      resetDialogFields(staffNickname);
      setNicknameDialogOpen(true);
    }
  }, [
    bypassesNicknameAccess,
    checkingNicknameSession,
    nicknameSessionVerified,
    requiresNicknamePassword,
    resetDialogFields,
    staffNickname,
  ]);

  const handleCheckNickname = useCallback(async () => {
    const normalized = String(nicknameInput || "").trim();
    if (normalized.length < 2) {
      toast({
        title: "Validation Error",
        description: "Sila masukkan nickname yang sah.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingNicknameAuth(true);
    try {
      const response = await checkCollectionNicknameAuth(normalized);
      const nextNickname = String(response?.nickname?.nickname || normalized).trim();
      setResolvedNickname(nextNickname);
      setNicknameInput(nextNickname);
      setNicknamePassword("");
      setConfirmNicknamePassword("");
      setVerifiedNicknamePassword("");
      setShowLoginPassword(false);
      setShowSetupPassword(false);
      setShowSetupConfirmPassword(false);

      if (response?.nickname?.requiresPasswordSetup) {
        setSetupMode("first-time");
        setDialogStep("setup");
      } else {
        setDialogStep("login");
      }
    } catch (error: unknown) {
      const errorMessage = parseApiError(error);
      toast({
        title: "Nickname Tidak Sah",
        description: errorMessage
          ? `${errorMessage}. Jika nickname salah atau terlupa, sila contact superuser.`
          : "Nickname tidak sah. Jika nickname salah atau terlupa, sila contact superuser.",
        variant: "destructive",
      });
    } finally {
      setSubmittingNicknameAuth(false);
    }
  }, [nicknameInput, toast]);

  const handleSetupNicknamePassword = useCallback(async () => {
    const nickname = String(resolvedNickname || nicknameInput || "").trim();
    if (!nickname) return;

    if (!isCredentialPasswordPolicyCompliant(nicknamePassword)) {
      toast({
        title: "Validation Error",
        description: getCredentialPasswordPolicyMessage("ms"),
        variant: "destructive",
      });
      return;
    }
    if (nicknamePassword !== confirmNicknamePassword) {
      toast({
        title: "Validation Error",
        description: "Password dan confirm password tidak sepadan.",
        variant: "destructive",
      });
      return;
    }
    if (setupMode === "forced-change") {
      if (!verifiedNicknamePassword) {
        toast({
          title: "Sesi Tamat",
          description: "Sila login semula dengan password sementara sebelum tukar password baharu.",
          variant: "destructive",
        });
        setDialogStep("login");
        return;
      }
      if (nicknamePassword === verifiedNicknamePassword) {
        toast({
          title: "Validation Error",
          description: "Password baharu mesti berbeza daripada password sementara.",
          variant: "destructive",
        });
        return;
      }
    }

    setSubmittingNicknameAuth(true);
    try {
      const response = await setupCollectionNicknamePassword({
        nickname,
        currentPassword: setupMode === "forced-change" ? verifiedNicknamePassword : undefined,
        newPassword: nicknamePassword,
        confirmPassword: confirmNicknamePassword,
      });
      const activeNickname = String(response?.nickname?.nickname || nickname).trim();
      applyNicknameSession(activeNickname);
      resetDialogFields(activeNickname);
      toast({
        title: "Password Nickname Disimpan",
        description: "Password baharu berjaya disimpan. Anda kini boleh gunakan Collection Report.",
      });
    } catch (error: unknown) {
      toast({
        title: "Gagal Simpan Password",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSubmittingNicknameAuth(false);
    }
  }, [
    applyNicknameSession,
    confirmNicknamePassword,
    nicknameInput,
    nicknamePassword,
    resetDialogFields,
    resolvedNickname,
    setupMode,
    toast,
    verifiedNicknamePassword,
  ]);

  const handleNicknameLogin = useCallback(async () => {
    const nickname = String(resolvedNickname || nicknameInput || "").trim();
    if (!nickname) return;
    if (!nicknamePassword) {
      toast({
        title: "Validation Error",
        description: "Sila masukkan password nickname.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingNicknameAuth(true);
    try {
      const response = await loginCollectionNickname({ nickname, password: nicknamePassword });

      if (response?.nickname?.requiresForcedPasswordChange) {
        setSetupMode("forced-change");
        setVerifiedNicknamePassword(nicknamePassword);
        setDialogStep("setup");
        setNicknamePassword("");
        setConfirmNicknamePassword("");
        setShowLoginPassword(false);
        setShowSetupPassword(false);
        setShowSetupConfirmPassword(false);
        toast(getCollectionNicknameForcedChangeToast());
        return;
      }

      const activeNickname = String(response?.nickname?.nickname || nickname).trim();
      applyNicknameSession(activeNickname);
      resetDialogFields(activeNickname);
      toast({
        title: "Nickname Login Berjaya",
        description: `Nama staff collection: ${activeNickname}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Password Tidak Sah",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSubmittingNicknameAuth(false);
    }
  }, [applyNicknameSession, nicknameInput, nicknamePassword, resetDialogFields, resolvedNickname, toast]);

  return {
    applyNicknameSession,
    canAccessCollection,
    checkingNicknameSession,
    clearNicknameSession,
    confirmNicknamePassword,
    dialogStep,
    handleCheckNickname,
    handleNicknameLogin,
    handleSetupNicknamePassword,
    nicknameDialogOpen,
    nicknameInput,
    nicknamePassword,
    nicknameReauthenticationRequired,
    nicknameSessionVerified,
    requestNicknameReauthentication,
    resolvedNickname,
    setConfirmNicknamePassword,
    setDialogStep,
    setNicknameDialogOpen,
    setNicknameInput,
    setNicknamePassword,
    setResolvedNickname,
    setSetupMode,
    setShowLoginPassword,
    setShowSetupConfirmPassword,
    setShowSetupPassword,
    setupMode,
    showLoginPassword,
    showSetupConfirmPassword,
    showSetupPassword,
    staffNickname,
    submittingNicknameAuth,
    verifiedNicknamePassword,
  };
}

export type CollectionNicknameAccessValue = ReturnType<
  typeof useCollectionNicknameAccess
>;
