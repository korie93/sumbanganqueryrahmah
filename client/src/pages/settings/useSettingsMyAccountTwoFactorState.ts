import { useCallback, useEffect, useRef, useState } from "react";
import { disableTwoFactor, enableTwoFactor, getTwoFactorStatus, startTwoFactorSetup } from "@/lib/api";
import { buildMutationSuccessToast } from "@/lib/mutation-feedback";
import { getAuthErrorCode, getAuthErrorMessage } from "@/lib/auth-flow-feedback";
import type { SyncCurrentUserFn, UseSettingsMyAccountArgs } from "@/pages/settings/settings-my-account-shared";
import { buildNextCurrentUser, canConfigureTwoFactor, normalizeAuthenticatorCode } from "@/pages/settings/settings-my-account-utils";
import type { CurrentUser } from "@/pages/settings/types";

type Args = UseSettingsMyAccountArgs & { currentUser: CurrentUser | null; syncCurrentUser: SyncCurrentUserFn };
type PendingSetup = { accountKey: string; accountName: string; issuer: string; secret: string; uri: string; expiresAt: string };
const EXPIRED_MESSAGE = "Persediaan 2FA telah tamat tempoh. Mulakan semula dan gantikan entri lama dalam aplikasi pengesah.";
const validatePassword = (value: string) => value ? null : "Sila masukkan kata laluan semasa.";
const validateCode = (value: string) => normalizeAuthenticatorCode(value).length === 6 ? null : "Sila masukkan kod pengesah 6 digit.";

export function useSettingsMyAccountTwoFactorState({ currentUser, isMountedRef, syncCurrentUser, toast }: Args) {
  const [twoFactorPasswordInput, setPassword] = useState("");
  const [twoFactorPasswordError, setPasswordError] = useState<string | null>(null);
  const [twoFactorCodeInput, setCode] = useState("");
  const [twoFactorCodeError, setCodeError] = useState<string | null>(null);
  const [setup, setSetup] = useState<PendingSetup | null>(null);
  const [twoFactorActionError, setActionError] = useState<string | null>(null);
  const [twoFactorLoading, setLoading] = useState(false);
  const accountKey = currentUser ? [currentUser.id ?? "", currentUser.username, currentUser.role].join(":") : "";
  const currentAccountRef = useRef(accountKey);
  currentAccountRef.current = accountKey;
  const requestRef = useRef<{ generation: number; controller: AbortController | null }>({ generation: 0, controller: null });
  const liveRef = useRef(true);

  const setTwoFactorPasswordInput = useCallback((value: string) => {
    setPassword(value);
    setPasswordError(null);
  }, []);
  const setTwoFactorCodeInput = useCallback((value: string) => {
    setCode(normalizeAuthenticatorCode(value));
    setCodeError(null);
  }, []);
  const clearSetup = useCallback(() => {
    setSetup(null);
    setCode("");
    setCodeError(null);
    setPassword("");
    setPasswordError(null);
  }, []);
  const handleClearTwoFactorSetup = useCallback(() => {
    if (requestRef.current.controller) return;
    clearSetup();
    setActionError(null);
  }, [clearSetup]);

  useEffect(() => {
    liveRef.current = true;
    requestRef.current.controller?.abort();
    requestRef.current = { generation: requestRef.current.generation + 1, controller: null };
    clearSetup();
    setActionError(null);
    setLoading(false);
    return () => {
      liveRef.current = false;
      requestRef.current.controller?.abort();
      requestRef.current = { generation: requestRef.current.generation + 1, controller: null };
    };
  }, [accountKey, clearSetup]);

  useEffect(() => {
    if (!currentUser?.twoFactorEnabled) return;
    // An authoritative refresh may observe enablement while an older setup
    // response is still in flight. Never let that response restore pending
    // material or overwrite the newer enabled state for the same account.
    requestRef.current.controller?.abort();
    requestRef.current = { generation: requestRef.current.generation + 1, controller: null };
    setLoading(false);
    clearSetup();
  }, [clearSetup, currentUser?.twoFactorEnabled]);

  useEffect(() => {
    if (!setup || setup.accountKey !== accountKey) return;
    const expire = () => {
      clearSetup();
      setActionError(EXPIRED_MESSAGE);
    };
    const remaining = Date.parse(setup.expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      expire();
      return;
    }
    const timeout = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timeout);
  }, [accountKey, clearSetup, setup]);

  const beginRequest = useCallback(() => {
    if (!currentUser || currentAccountRef.current !== accountKey || requestRef.current.controller || !canConfigureTwoFactor(currentUser.role)) return null;
    const controller = new AbortController();
    const generation = requestRef.current.generation + 1;
    requestRef.current = { controller, generation };
    setLoading(true);
    setActionError(null);
    return {
      signal: controller.signal,
      isCurrent: () => liveRef.current && isMountedRef.current && !controller.signal.aborted
        && currentAccountRef.current === accountKey && requestRef.current.generation === generation,
      finish: () => {
        if (requestRef.current.generation !== generation) return;
        requestRef.current.controller = null;
        if (liveRef.current && isMountedRef.current && currentAccountRef.current === accountKey) setLoading(false);
      },
    };
  }, [accountKey, currentUser, isMountedRef]);

  const reconcileStatus = useCallback(async (request: NonNullable<ReturnType<typeof beginRequest>>) => {
    if (!currentUser) return;
    try {
      const response = await getTwoFactorStatus({ signal: request.signal });
      if (request.isCurrent()) syncCurrentUser(buildNextCurrentUser(currentUser, currentUser.username, response));
    } catch {
      // Preserve the original safe action error if this read-only refresh fails.
    }
  }, [currentUser, syncCurrentUser]);

  const handleStartTwoFactorSetup = useCallback(async () => {
    if (!currentUser || requestRef.current.controller) return;
    const validation = validatePassword(twoFactorPasswordInput);
    setPasswordError(validation);
    if (validation) return;
    const request = beginRequest();
    if (!request) return;
    try {
      const response = await startTwoFactorSetup({ currentPassword: twoFactorPasswordInput }, { signal: request.signal });
      if (!request.isCurrent()) return;
      syncCurrentUser(buildNextCurrentUser(currentUser, currentUser.username, response));
      setSetup({ accountKey, accountName: response.setup.accountName, issuer: response.setup.issuer,
        secret: response.setup.secret, uri: response.setup.otpauthUrl, expiresAt: response.setup.expiresAt });
      setCode("");
      setCodeError(null);
      setPassword("");
      setPasswordError(null);
    } catch (error: unknown) {
      if (!request.isCurrent()) return;
      const message = getAuthErrorMessage(error, "Persediaan 2FA gagal. Sila cuba lagi.");
      if (getAuthErrorCode(error) === "INVALID_CURRENT_PASSWORD") setPasswordError(message);
      else setActionError(message);
      if (getAuthErrorCode(error) === "TWO_FACTOR_ALREADY_ENABLED") await reconcileStatus(request);
    } finally { request.finish(); }
  }, [accountKey, beginRequest, currentUser, reconcileStatus, syncCurrentUser, twoFactorPasswordInput]);

  const handleEnableTwoFactor = useCallback(async () => {
    if (!currentUser || requestRef.current.controller) return;
    if (!setup || setup.accountKey !== accountKey || !Number.isFinite(Date.parse(setup.expiresAt)) || Date.parse(setup.expiresAt) <= Date.now()) {
      clearSetup();
      setActionError(EXPIRED_MESSAGE);
      return;
    }
    const validation = validateCode(twoFactorCodeInput);
    setCodeError(validation);
    if (validation) return;
    const request = beginRequest();
    if (!request) return;
    try {
      const response = await enableTwoFactor({ code: normalizeAuthenticatorCode(twoFactorCodeInput) }, { signal: request.signal });
      if (!request.isCurrent()) return;
      syncCurrentUser(buildNextCurrentUser(currentUser, currentUser.username, response));
      clearSetup();
      setActionError(null);
      toast(buildMutationSuccessToast({ title: "2FA berjaya diaktifkan", description: "Gunakan kod daripada aplikasi pengesah apabila anda log masuk." }));
    } catch (error: unknown) {
      if (!request.isCurrent()) return;
      const code = getAuthErrorCode(error);
      const message = getAuthErrorMessage(error, "Pengesahan 2FA gagal. Sila cuba lagi.");
      if (["TWO_FACTOR_SETUP_EXPIRED", "TWO_FACTOR_SETUP_MISSING", "TWO_FACTOR_ALREADY_ENABLED", "TWO_FACTOR_SECRET_INVALID"].includes(code ?? "")) {
        clearSetup();
        setActionError(message);
        await reconcileStatus(request);
      } else setCodeError(message);
    } finally { request.finish(); }
  }, [accountKey, beginRequest, clearSetup, currentUser, reconcileStatus, setup, syncCurrentUser, toast, twoFactorCodeInput]);

  const handleDisableTwoFactor = useCallback(async () => {
    if (!currentUser || requestRef.current.controller) return;
    const passwordValidation = validatePassword(twoFactorPasswordInput);
    const codeValidation = validateCode(twoFactorCodeInput);
    setPasswordError(passwordValidation);
    setCodeError(codeValidation);
    if (passwordValidation || codeValidation) return;
    const request = beginRequest();
    if (!request) return;
    try {
      const response = await disableTwoFactor({ currentPassword: twoFactorPasswordInput, code: normalizeAuthenticatorCode(twoFactorCodeInput) }, { signal: request.signal });
      if (!request.isCurrent()) return;
      syncCurrentUser(buildNextCurrentUser(currentUser, currentUser.username, response));
      clearSetup();
      setActionError(null);
      toast(buildMutationSuccessToast({ title: "2FA telah dinyahaktifkan", description: "Anda boleh mengaktifkannya semula dengan persediaan baharu." }));
    } catch (error: unknown) {
      if (!request.isCurrent()) return;
      const code = getAuthErrorCode(error);
      const message = getAuthErrorMessage(error, "2FA tidak dapat dinyahaktifkan. Sila cuba lagi.");
      if (code === "INVALID_CURRENT_PASSWORD") setPasswordError(message);
      else if (["TWO_FACTOR_INVALID_CODE", "TWO_FACTOR_CODE_INVALID", "TWO_FACTOR_CODE_REPLAYED"].includes(code ?? "")) setCodeError(message);
      else setActionError(message);
      if (code === "TWO_FACTOR_NOT_ENABLED") {
        clearSetup();
        await reconcileStatus(request);
      }
    } finally { request.finish(); }
  }, [beginRequest, clearSetup, currentUser, reconcileStatus, syncCurrentUser, toast, twoFactorCodeInput, twoFactorPasswordInput]);

  const visibleSetup = setup?.accountKey === accountKey && !currentUser?.twoFactorEnabled ? setup : null;
  return {
    handleClearTwoFactorSetup, handleDisableTwoFactor, handleEnableTwoFactor, handleStartTwoFactorSetup,
    handleTwoFactorCodeBlur: () => setCodeError(validateCode(twoFactorCodeInput)),
    handleTwoFactorPasswordBlur: () => setPasswordError(validatePassword(twoFactorPasswordInput)),
    setTwoFactorCodeInput, setTwoFactorPasswordInput, twoFactorActionError, twoFactorCodeError, twoFactorCodeInput,
    twoFactorLoading, twoFactorPasswordError, twoFactorPasswordInput,
    twoFactorSetupAccountName: visibleSetup?.accountName ?? "",
    twoFactorSetupIssuer: visibleSetup?.issuer ?? "",
    twoFactorSetupSecret: visibleSetup?.secret ?? "",
    twoFactorSetupUri: visibleSetup?.uri ?? "",
    twoFactorSetupExpiresAt: visibleSetup?.expiresAt ?? null,
  };
}
