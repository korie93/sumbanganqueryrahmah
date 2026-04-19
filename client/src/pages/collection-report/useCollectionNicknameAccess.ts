import { useCallback, useEffect, useState } from "react";
import { PASSWORD_POLICY_ERROR_MESSAGE_MS, isStrongPassword } from "@shared/password-policy";
import { useToast } from "@/hooks/use-toast";
import {
  checkCollectionNicknameAuth,
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
  getStoredCollectionNicknameAuthRaw,
  isValidNicknameAuthSession,
  persistCollectionNicknameSessionStorage,
} from "@/pages/collection-report/utils";

interface UseCollectionNicknameAccessOptions {
  currentUsername: string;
  isSuperuser: boolean;
  requiresNicknamePassword: boolean;
  role: string;
}

export function useCollectionNicknameAccess({
  currentUsername,
  isSuperuser,
  requiresNicknamePassword,
  role,
}: UseCollectionNicknameAccessOptions) {
  const { toast } = useToast();
  const [staffNickname, setStaffNickname] = useState(() => {
    if (typeof window === "undefined") return "";
    return getStoredCollectionNickname();
  });
  const [nicknameSessionVerified, setNicknameSessionVerified] = useState(() => {
    if (typeof window === "undefined") return false;
    const nickname = getStoredCollectionNickname();
    const authRaw = getStoredCollectionNicknameAuthRaw();
    return isValidNicknameAuthSession(authRaw, currentUsername, role, nickname);
  });
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

  const canAccessCollection = isSuperuser ? true : Boolean(staffNickname && nicknameSessionVerified);

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
    setNicknameDialogOpen(false);
    setVerifiedNicknamePassword("");
    setSetupMode("first-time");
    setShowLoginPassword(false);
    setShowSetupPassword(false);
    setShowSetupConfirmPassword(false);
  }, [currentUsername, role]);

  useEffect(() => {
    if (isSuperuser || !requiresNicknamePassword) return;
    if (!nicknameSessionVerified) {
      resetDialogFields(staffNickname);
      setNicknameDialogOpen(true);
    }
  }, [isSuperuser, nicknameSessionVerified, requiresNicknamePassword, resetDialogFields, staffNickname]);

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

    if (!isStrongPassword(nicknamePassword)) {
      toast({
        title: "Validation Error",
        description: PASSWORD_POLICY_ERROR_MESSAGE_MS,
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
    clearNicknameSession,
    confirmNicknamePassword,
    dialogStep,
    handleCheckNickname,
    handleNicknameLogin,
    handleSetupNicknamePassword,
    nicknameDialogOpen,
    nicknameInput,
    nicknamePassword,
    nicknameSessionVerified,
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
