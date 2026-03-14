import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  type ActivationDeliveryPayload,
  clearDevMailOutboxPreviews,
  createManagedUserAccount,
  deleteDevMailOutboxPreview,
  deleteManagedUserAccount,
  getDevMailOutboxPreviews,
  getMe,
  getPendingPasswordResetRequests,
  getSettings,
  getSuperuserManagedUsers,
  resendManagedUserActivation,
  resetManagedUserPassword,
  updateMyCredentials,
  updateManagedUserAccount,
  updateManagedUserRole,
  updateManagedUserStatus,
  updateSetting,
} from "@/lib/api";
import { clearAuthenticatedUserStorage, persistAuthenticatedUser } from "@/lib/auth-session";
import { SettingCard } from "@/pages/settings/SettingCard";
import type {
  CurrentUser,
  DevMailOutboxPreview,
  ManagedUser,
  PendingPasswordResetRequest,
  SettingCategory,
  SettingItem,
} from "@/pages/settings/types";
import {
  CREDENTIAL_USERNAME_REGEX,
  getRoleSettingOrder,
  isStrongPassword,
  normalizeSettingsErrorPayload,
  settingsCategoryOrder,
} from "@/pages/settings/utils";

function formatActivationExpiry(value: string | null | undefined) {
  if (!value) return "the configured expiry window";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function isDevOutboxActivation(
  activation: ActivationDeliveryPayload | undefined,
): activation is ActivationDeliveryPayload & { deliveryMode: "dev_outbox" } {
  return activation?.deliveryMode === "dev_outbox" && Boolean(String(activation.previewUrl || "").trim());
}

export function useSettingsController() {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const settingsRequestIdRef = useRef(0);
  const managedUsersRequestIdRef = useRef(0);
  const pendingResetRequestsRequestIdRef = useRef(0);
  const devMailOutboxRequestIdRef = useRef(0);
  const bootstrapRequestIdRef = useRef(0);
  const createManagedUserLockRef = useRef(false);
  const resendActivationLocksRef = useRef<Set<string>>(new Set());
  const resetPasswordLocksRef = useRef<Set<string>>(new Set());
  const deleteManagedUserLocksRef = useRef<Set<string>>(new Set());
  const deleteDevMailPreviewLocksRef = useRef<Set<string>>(new Set());

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [managedUsersLoading, setManagedUsersLoading] = useState(false);
  const [pendingResetRequests, setPendingResetRequests] = useState<PendingPasswordResetRequest[]>([]);
  const [pendingResetRequestsLoading, setPendingResetRequestsLoading] = useState(false);
  const [devMailOutboxEntries, setDevMailOutboxEntries] = useState<DevMailOutboxPreview[]>([]);
  const [devMailOutboxEnabled, setDevMailOutboxEnabled] = useState(false);
  const [devMailOutboxLoading, setDevMailOutboxLoading] = useState(false);
  const [managedDialogOpen, setManagedDialogOpen] = useState(false);
  const [managedSelectedUser, setManagedSelectedUser] = useState<ManagedUser | null>(
    null,
  );
  const [managedFullNameInput, setManagedFullNameInput] = useState("");
  const [managedEmailInput, setManagedEmailInput] = useState("");
  const [managedUsernameInput, setManagedUsernameInput] = useState("");
  const [managedRoleInput, setManagedRoleInput] = useState<"admin" | "user">("user");
  const [managedStatusInput, setManagedStatusInput] = useState<
    "pending_activation" | "active" | "suspended" | "disabled"
  >("active");
  const [managedIsBanned, setManagedIsBanned] = useState(false);
  const [managedSaving, setManagedSaving] = useState(false);
  const [createFullNameInput, setCreateFullNameInput] = useState("");
  const [createUsernameInput, setCreateUsernameInput] = useState("");
  const [createEmailInput, setCreateEmailInput] = useState("");
  const [createRoleInput, setCreateRoleInput] = useState<"admin" | "user">("user");
  const [creatingManagedUser, setCreatingManagedUser] = useState(false);
  const [deletingManagedUserId, setDeletingManagedUserId] = useState<string | null>(null);
  const [deletingDevMailOutboxId, setDeletingDevMailOutboxId] = useState<string | null>(null);
  const [clearingDevMailOutbox, setClearingDevMailOutbox] = useState(false);
  const [managedSecretDialogOpen, setManagedSecretDialogOpen] = useState(false);
  const [managedSecretDialogTitle, setManagedSecretDialogTitle] = useState("");
  const [managedSecretDialogDescription, setManagedSecretDialogDescription] = useState("");
  const [managedSecretDialogValue, setManagedSecretDialogValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<SettingCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [draftValues, setDraftValues] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [confirmCriticalOpen, setConfirmCriticalOpen] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      settingsRequestIdRef.current += 1;
      managedUsersRequestIdRef.current += 1;
      pendingResetRequestsRequestIdRef.current += 1;
      devMailOutboxRequestIdRef.current += 1;
      bootstrapRequestIdRef.current += 1;
    };
  }, []);

  const canEditSystemSettings =
    currentUser?.role === "admin" || currentUser?.role === "superuser";
  const isSuperuser = currentUser?.role === "superuser";
  const canAccessAccountSecurity = currentUser?.role === "superuser";
  const currentUserRole = currentUser?.role ?? "";

  const syncLocalUser = useCallback((nextUser: CurrentUser) => {
    persistAuthenticatedUser(nextUser);
    window.dispatchEvent(new CustomEvent("profile-updated", { detail: nextUser }));
  }, []);

  const forceLogoutAfterPasswordChange = useCallback(() => {
    clearAuthenticatedUserStorage();
    localStorage.setItem("forceLogout", "true");
    window.dispatchEvent(new CustomEvent("force-logout"));
    window.location.href = "/";
  }, []);

  const loadSettings = useCallback(async () => {
    const requestId = ++settingsRequestIdRef.current;
    setLoading(true);
    try {
      const response = await getSettings();
      if (!isMountedRef.current || requestId !== settingsRequestIdRef.current) return;

      const rawCategories = Array.isArray(response?.categories)
        ? response.categories
        : [];
      const sorted = [...rawCategories].sort(
        (left: SettingCategory, right: SettingCategory) => {
          const leftIndex = settingsCategoryOrder.indexOf(left.name);
          const rightIndex = settingsCategoryOrder.indexOf(right.name);
          if (leftIndex === -1 && rightIndex === -1) {
            return left.name.localeCompare(right.name);
          }
          if (leftIndex === -1) return 1;
          if (rightIndex === -1) return -1;
          return leftIndex - rightIndex;
        },
      );

      setCategories(sorted);
      setSelectedCategory((previous) => {
        if (!previous && sorted.length > 0) return sorted[0].id;
        if (previous && !sorted.some((category) => category.id === previous)) {
          return sorted[0]?.id || "";
        }
        return previous;
      });
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== settingsRequestIdRef.current) return;
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Settings",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== settingsRequestIdRef.current) return;
      setLoading(false);
    }
  }, [toast]);

  const loadManagedUsers = useCallback(async () => {
    const requestId = ++managedUsersRequestIdRef.current;
    setManagedUsersLoading(true);
    try {
      const response = await getSuperuserManagedUsers();
      if (!isMountedRef.current || requestId !== managedUsersRequestIdRef.current) return;
      setManagedUsers(Array.isArray(response?.users) ? response.users : []);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== managedUsersRequestIdRef.current) return;
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Managed Users",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== managedUsersRequestIdRef.current) return;
      setManagedUsersLoading(false);
    }
  }, [toast]);

  const loadPendingResetRequests = useCallback(async () => {
    const requestId = ++pendingResetRequestsRequestIdRef.current;
    setPendingResetRequestsLoading(true);
    try {
      const response = await getPendingPasswordResetRequests();
      if (!isMountedRef.current || requestId !== pendingResetRequestsRequestIdRef.current) return;
      setPendingResetRequests(Array.isArray(response?.requests) ? response.requests : []);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== pendingResetRequestsRequestIdRef.current) return;
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Reset Requests",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== pendingResetRequestsRequestIdRef.current) return;
      setPendingResetRequestsLoading(false);
    }
  }, [toast]);

  const loadDevMailOutbox = useCallback(async () => {
    const requestId = ++devMailOutboxRequestIdRef.current;
    setDevMailOutboxLoading(true);
    try {
      const response = await getDevMailOutboxPreviews();
      if (!isMountedRef.current || requestId !== devMailOutboxRequestIdRef.current) return;
      setDevMailOutboxEnabled(Boolean(response?.enabled));
      setDevMailOutboxEntries(Array.isArray(response?.previews) ? response.previews : []);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== devMailOutboxRequestIdRef.current) return;
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Mail Outbox",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== devMailOutboxRequestIdRef.current) return;
      setDevMailOutboxLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const requestId = ++bootstrapRequestIdRef.current;

    const bootstrap = async () => {
      setProfileLoading(true);
      try {
        const me = await getMe();
        if (!isMountedRef.current || requestId !== bootstrapRequestIdRef.current) return;

        setCurrentUser(me);
        setUsernameInput(me.username);

        if (me.role === "admin" || me.role === "superuser") {
          await loadSettings();
        } else {
          setLoading(false);
          setCategories([]);
          setSelectedCategory("");
        }

        if (
          me.role === "superuser" &&
          isMountedRef.current &&
          requestId === bootstrapRequestIdRef.current
        ) {
          await loadManagedUsers();
          if (
            isMountedRef.current &&
            requestId === bootstrapRequestIdRef.current
          ) {
            await loadPendingResetRequests();
            if (
              isMountedRef.current &&
              requestId === bootstrapRequestIdRef.current
            ) {
              await loadDevMailOutbox();
            }
          }
        }
      } catch (error: unknown) {
        if (!isMountedRef.current || requestId !== bootstrapRequestIdRef.current) return;
        const parsed = normalizeSettingsErrorPayload(error);
        toast({
          title: "Failed to Load Profile",
          description: parsed.message,
          variant: "destructive",
        });
      } finally {
        if (!isMountedRef.current || requestId !== bootstrapRequestIdRef.current) return;
        setProfileLoading(false);
      }
    };

    void bootstrap();
  }, [loadDevMailOutbox, loadManagedUsers, loadPendingResetRequests, loadSettings, toast]);

  const settingMap = useMemo(() => {
    const map = new Map<string, SettingItem>();
    for (const category of categories) {
      for (const setting of category.settings) {
        map.set(setting.key, setting);
      }
    }
    return map;
  }, [categories]);

  const currentCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategory) || null,
    [categories, selectedCategory],
  );
  const dirtyCount = dirtyKeys.size;
  const dirtyCriticalCount = useMemo(
    () =>
      Array.from(dirtyKeys).filter((key) => settingMap.get(key)?.isCritical).length,
    [dirtyKeys, settingMap],
  );
  const isRolePermissionCategory = currentCategory?.name === "Roles & Permissions";
  const isSecurityCategory = currentCategory?.name === "Security";

  const categoryDirtyMap = useMemo(() => {
    const next = new Map<string, number>();
    if (dirtyKeys.size === 0) return next;

    for (const category of categories) {
      let count = 0;
      for (const setting of category.settings) {
        if (dirtyKeys.has(setting.key)) count += 1;
      }
      if (count > 0) next.set(category.id, count);
    }

    return next;
  }, [categories, dirtyKeys]);

  const roleSections = useMemo(() => {
    if (!isRolePermissionCategory || !currentCategory) return null;

    const isObsoleteAiToggle = (setting: SettingItem) =>
      setting.key === "tab_admin_ai_enabled" || setting.key === "tab_user_ai_enabled";

    const admin = currentCategory.settings
      .filter(
        (setting) =>
          setting.key.startsWith("tab_admin_") ||
          setting.key === "canViewSystemPerformance",
      )
      .filter((setting) => !isObsoleteAiToggle(setting))
      .sort(
        (left, right) =>
          getRoleSettingOrder(left.key) - getRoleSettingOrder(right.key) ||
          left.label.localeCompare(right.label),
      );

    const user = currentCategory.settings
      .filter((setting) => setting.key.startsWith("tab_user_"))
      .filter((setting) => !isObsoleteAiToggle(setting))
      .sort(
        (left, right) =>
          getRoleSettingOrder(left.key) - getRoleSettingOrder(right.key) ||
          left.label.localeCompare(right.label),
      );

    const other = currentCategory.settings
      .filter(
        (setting) =>
          !setting.key.startsWith("tab_admin_") &&
          !setting.key.startsWith("tab_user_") &&
          setting.key !== "canViewSystemPerformance",
      )
      .sort((left, right) => left.label.localeCompare(right.label));

    return { admin, user, other };
  }, [currentCategory, isRolePermissionCategory]);

  const getEffectiveValue = useCallback(
    (setting: SettingItem) =>
      Object.prototype.hasOwnProperty.call(draftValues, setting.key)
        ? draftValues[setting.key]
        : setting.value,
    [draftValues],
  );

  const markDirty = useCallback(
    (key: string, value: string | number | boolean | null) => {
      const originalValue = settingMap.get(key)?.value ?? null;
      const sameAsOriginal = String(value ?? "") === String(originalValue ?? "");

      setDraftValues((previous) => {
        if (sameAsOriginal) {
          if (!Object.prototype.hasOwnProperty.call(previous, key)) return previous;
          const { [key]: _removed, ...rest } = previous;
          return rest;
        }

        const currentValue = Object.prototype.hasOwnProperty.call(previous, key)
          ? previous[key]
          : originalValue;
        if (String(currentValue ?? "") === String(value ?? "")) return previous;
        return { ...previous, [key]: value };
      });

      setDirtyKeys((previous) => {
        const hasKey = previous.has(key);
        if (sameAsOriginal && !hasKey) return previous;
        if (!sameAsOriginal && hasKey) return previous;
        const next = new Set(previous);
        if (sameAsOriginal) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [settingMap],
  );

  const persistChanges = useCallback(
    async (confirmCritical: boolean) => {
      if (dirtyKeys.size === 0) return;

      setSaving(true);
      try {
        const keys = Array.from(dirtyKeys);
        for (const key of keys) {
          const payloadValue = Object.prototype.hasOwnProperty.call(draftValues, key)
            ? draftValues[key]
            : settingMap.get(key)?.value ?? null;

          try {
            await updateSetting({
              key,
              value: payloadValue ?? null,
              confirmCritical,
            });
          } catch (error: unknown) {
            const parsed = normalizeSettingsErrorPayload(error);
            if (parsed.requiresConfirmation && !confirmCritical) {
              if (isMountedRef.current) setConfirmCriticalOpen(true);
              return;
            }

            toast({
              title: `Failed to Save: ${key}`,
              description: parsed.message,
              variant: "destructive",
            });
            return;
          }
        }

        toast({
          title: "Settings Updated",
          description: `${keys.length} setting(s) saved successfully.`,
        });

        window.dispatchEvent(
          new CustomEvent("settings-updated", {
            detail: { source: "settings-page" },
          }),
        );
        if (!isMountedRef.current) return;
        setDirtyKeys(new Set());
        setDraftValues({});
        await loadSettings();
      } finally {
        if (!isMountedRef.current) return;
        setSaving(false);
      }
    },
    [dirtyKeys, draftValues, loadSettings, settingMap, toast],
  );

  const handleSave = useCallback(async () => {
    if (dirtyCount === 0 || saving) return;
    if (dirtyCriticalCount > 0) {
      setConfirmCriticalOpen(true);
      return;
    }
    await persistChanges(false);
  }, [dirtyCount, dirtyCriticalCount, persistChanges, saving]);

  const renderSettingCard = useCallback(
    (setting: SettingItem) => (
      <SettingCard
        key={setting.key}
        setting={setting}
        value={getEffectiveValue(setting)}
        isDirty={dirtyKeys.has(setting.key)}
        saving={saving}
        onChange={markDirty}
      />
    ),
    [dirtyKeys, getEffectiveValue, markDirty, saving],
  );

  const handleChangeUsername = useCallback(async () => {
    if (!currentUser || usernameSaving) return;
    const normalized = usernameInput.trim().toLowerCase();

    if (!CREDENTIAL_USERNAME_REGEX.test(normalized)) {
      toast({
        title: "Validation Error",
        description: "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
        variant: "destructive",
      });
      return;
    }

    if (normalized === currentUser.username) {
      toast({ title: "No Changes", description: "Username is unchanged." });
      return;
    }

    setUsernameSaving(true);
    try {
      const response = await updateMyCredentials({ newUsername: normalized });
      const nextUser: CurrentUser = {
        id: String(response?.user?.id || currentUser.id),
        username: String(response?.user?.username || normalized),
        fullName: response?.user?.fullName ?? currentUser.fullName ?? null,
        email: response?.user?.email ?? currentUser.email ?? null,
        role: String(response?.user?.role || currentUser.role),
        status: String(response?.user?.status || currentUser.status || "active"),
        mustChangePassword: Boolean(
          response?.user?.mustChangePassword ?? currentUser.mustChangePassword,
        ),
        passwordResetBySuperuser: Boolean(
          response?.user?.passwordResetBySuperuser ?? currentUser.passwordResetBySuperuser,
        ),
        isBanned: response?.user?.isBanned ?? currentUser.isBanned ?? null,
      };

      if (!isMountedRef.current) return;
      setCurrentUser(nextUser);
      setUsernameInput(nextUser.username);
      syncLocalUser(nextUser);

      toast({
        title: "Username Updated",
        description: "Your username has been updated successfully.",
      });
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setUsernameSaving(false);
    }
  }, [currentUser, syncLocalUser, toast, usernameInput, usernameSaving]);

  const handleChangePassword = useCallback(async () => {
    if (!currentUser || passwordSaving) return;

    if (!currentPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Current password is required.",
        variant: "destructive",
      });
      return;
    }

    if (!isStrongPassword(newPasswordInput)) {
      toast({
        title: "Validation Error",
        description:
          "New password must be at least 8 characters and include at least one letter and one number.",
        variant: "destructive",
      });
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Confirm password does not match.",
        variant: "destructive",
      });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await updateMyCredentials({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
      });

      if (!isMountedRef.current) return;
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");

      toast({
        title: "Password Updated",
        description: "Password changed successfully. You will need to login again.",
      });

      if (response?.forceLogout) {
        forceLogoutAfterPasswordChange();
      }
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setPasswordSaving(false);
    }
  }, [
    confirmPasswordInput,
    currentPasswordInput,
    currentUser,
    forceLogoutAfterPasswordChange,
    newPasswordInput,
    passwordSaving,
    toast,
  ]);

  const openManagedEditor = useCallback((user: ManagedUser) => {
    setManagedSelectedUser(user);
    setManagedFullNameInput(user.fullName || "");
    setManagedEmailInput(user.email || "");
    setManagedUsernameInput(user.username);
    setManagedRoleInput(user.role === "admin" ? "admin" : "user");
    setManagedStatusInput(
      (user.status as "pending_activation" | "active" | "suspended" | "disabled") || "active",
    );
    setManagedIsBanned(Boolean(user.isBanned));
    setManagedDialogOpen(true);
  }, []);

  const handleManagedDialogChange = useCallback((open: boolean) => {
    setManagedDialogOpen(open);
    if (!open) {
      setManagedSelectedUser(null);
      setManagedFullNameInput("");
      setManagedEmailInput("");
      setManagedUsernameInput("");
      setManagedRoleInput("user");
      setManagedStatusInput("active");
      setManagedIsBanned(false);
    }
  }, []);

  const openManagedSecretDialog = useCallback((params: {
    title: string;
    description: string;
    value?: string;
  }) => {
    setManagedSecretDialogTitle(params.title);
    setManagedSecretDialogDescription(params.description);
    setManagedSecretDialogValue(params.value || "");
    setManagedSecretDialogOpen(true);
  }, []);

  const refreshManagedUsersSection = useCallback(async () => {
    await loadManagedUsers();
  }, [loadManagedUsers]);

  const refreshPendingResetRequestsSection = useCallback(async () => {
    await loadPendingResetRequests();
  }, [loadPendingResetRequests]);

  const refreshDevMailOutboxSection = useCallback(async () => {
    await loadDevMailOutbox();
  }, [loadDevMailOutbox]);

  const handleSaveManagedUser = useCallback(async () => {
    if (!managedSelectedUser || managedSaving) return;

    const normalizedUsername = managedUsernameInput.trim().toLowerCase();
    const normalizedEmail = managedEmailInput.trim().toLowerCase();
    const payload: { username?: string; fullName?: string | null; email?: string | null } = {};

    if (managedFullNameInput.trim() !== (managedSelectedUser.fullName || "")) {
      payload.fullName = managedFullNameInput.trim() || null;
    }

    if (normalizedUsername !== managedSelectedUser.username) {
      if (!CREDENTIAL_USERNAME_REGEX.test(normalizedUsername)) {
        toast({
          title: "Validation Error",
          description: "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
          variant: "destructive",
        });
        return;
      }
      payload.username = normalizedUsername;
    }

    if (normalizedEmail !== (managedSelectedUser.email || "").toLowerCase()) {
      payload.email = normalizedEmail || null;
    }

    setManagedSaving(true);
    try {
      if (
        payload.username !== undefined
        || payload.fullName !== undefined
        || payload.email !== undefined
      ) {
        await updateManagedUserAccount(managedSelectedUser.id, payload);
      }

      if (managedRoleInput !== managedSelectedUser.role) {
        await updateManagedUserRole(managedSelectedUser.id, managedRoleInput);
      }

      if (
        managedStatusInput !== managedSelectedUser.status
        || managedIsBanned !== Boolean(managedSelectedUser.isBanned)
      ) {
        await updateManagedUserStatus(managedSelectedUser.id, {
          status: managedStatusInput,
          isBanned: managedIsBanned,
        });
      }

      toast({
        title: "Account Updated",
        description: `Updated account settings for ${managedSelectedUser.username}.`,
      });
      if (!isMountedRef.current) return;
      handleManagedDialogChange(false);
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current) return;
      setManagedSaving(false);
    }
  }, [
    handleManagedDialogChange,
    managedEmailInput,
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
    managedSelectedUser,
    managedStatusInput,
    managedUsernameInput,
    loadManagedUsers,
    loadPendingResetRequests,
    toast,
  ]);

  const handleCreateManagedUser = useCallback(async () => {
    if (creatingManagedUser || createManagedUserLockRef.current) return;

    const normalizedUsername = createUsernameInput.trim().toLowerCase();
    const normalizedEmail = createEmailInput.trim().toLowerCase();

    if (!CREDENTIAL_USERNAME_REGEX.test(normalizedUsername)) {
      toast({
        title: "Validation Error",
        description: "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
        variant: "destructive",
      });
      return;
    }

    if (!normalizedEmail) {
      toast({
        title: "Validation Error",
        description: "Email is required for account activation.",
        variant: "destructive",
      });
      return;
    }

    createManagedUserLockRef.current = true;
    setCreatingManagedUser(true);
    try {
      const response = await createManagedUserAccount({
        username: normalizedUsername,
        fullName: createFullNameInput.trim() || null,
        email: normalizedEmail || null,
        role: createRoleInput,
      });
      const activation = response?.activation as ActivationDeliveryPayload | undefined;
      const recipientEmail = String(activation?.recipientEmail || normalizedEmail);
      const expiresAt = formatActivationExpiry(activation?.expiresAt);
      const previewUrl = String(activation?.previewUrl || "");

      if (isDevOutboxActivation(activation)) {
        toast({
          title: "Account Created",
          description: `Created ${createRoleInput} account for ${normalizedUsername}. Activation email was captured in the local development outbox.`,
        });
        openManagedSecretDialog({
          title: "Local Activation Email Preview",
          description: `SMTP is not configured, so the activation email was written to the local development outbox instead. Open this preview URL and follow the activation link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (activation?.sent) {
        toast({
          title: "Account Created",
          description: `Created ${createRoleInput} account for ${normalizedUsername}. Activation email sent to ${recipientEmail}.`,
        });
      } else {
        openManagedSecretDialog({
          title: "Activation Email Not Sent",
          description:
            activation?.errorMessage
              ? `The account was created and remains pending activation, but email delivery failed: ${activation.errorMessage}. Configure SMTP and use Resend Activation.`
              : "The account was created and remains pending activation, but the activation email could not be sent. Configure SMTP and use Resend Activation.",
          value: previewUrl || undefined,
        });
        toast({
          title: "Account Created",
          description: `${normalizedUsername} remains pending activation until the email is delivered.`,
        });
      }

      if (previewUrl && activation?.sent && activation?.deliveryMode === "smtp") {
        openManagedSecretDialog({
          title: "Activation Email Preview",
          description: `Email delivery is configured with a preview URL. The activation link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }


      if (!isMountedRef.current) return;
      setCreateFullNameInput("");
      setCreateUsernameInput("");
      setCreateEmailInput("");
      setCreateRoleInput("user");
      await Promise.all([loadManagedUsers(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      if (parsed.code === "USERNAME_TAKEN" || parsed.code === "INVALID_EMAIL") {
        await loadManagedUsers();

        const duplicate = managedUsers.find((user) => {
          const sameUsername = user.username.toLowerCase() === normalizedUsername;
          const sameEmail =
            normalizedEmail !== ""
              && String(user.email || "").trim().toLowerCase() === normalizedEmail;
          return sameUsername || sameEmail;
        });

        if (duplicate) {
          openManagedSecretDialog({
            title: "Account Already Exists",
            description:
              duplicate.status === "pending_activation"
                ? `${duplicate.username} already exists and is still pending activation. Use Resend Activation after SMTP is configured.`
                : `${duplicate.username} already exists in the system.`,
          });
          return;
        }
      }

      toast({
        title: parsed.code || "Create Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      createManagedUserLockRef.current = false;
      if (!isMountedRef.current) return;
      setCreatingManagedUser(false);
    }
  }, [
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    creatingManagedUser,
    loadDevMailOutbox,
    loadManagedUsers,
    managedUsers,
    openManagedSecretDialog,
    toast,
  ]);

  const handleResetManagedUserPassword = useCallback(async (user: ManagedUser) => {
    if (resetPasswordLocksRef.current.has(user.id)) return;
    if (!window.confirm(`Send password reset email to ${user.username}?`)) return;

    resetPasswordLocksRef.current.add(user.id);
    try {
      const response = await resetManagedUserPassword(user.id);
      const reset = response?.reset as ActivationDeliveryPayload | undefined;
      const recipientEmail = String(reset?.recipientEmail || user.email || user.username);
      const expiresAt = formatActivationExpiry(reset?.expiresAt);
      const previewUrl = String(reset?.previewUrl || "");

      if (isDevOutboxActivation(reset)) {
        toast({
          title: "Password Reset Email Sent",
          description: `Password reset email for ${user.username} was captured in the local development outbox.`,
        });
        openManagedSecretDialog({
          title: "Local Password Reset Email Preview",
          description: `SMTP is not configured, so the password reset email was written to the local development outbox instead. Open this preview URL and follow the reset link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (reset?.sent) {
        toast({
          title: "Password Reset Email Sent",
          description: `Password reset email sent to ${recipientEmail}.`,
        });
      } else {
        openManagedSecretDialog({
          title: "Password Reset Email Not Sent",
          description:
            reset?.errorMessage
              ? `The password reset email could not be sent: ${reset.errorMessage}. No account login state was changed, so you can retry after fixing delivery.`
              : "The password reset email could not be sent. No account login state was changed, so you can retry after fixing delivery.",
          value: previewUrl || undefined,
        });
        toast({
          title: "Password Reset Pending",
          description: `${user.username} will need a delivered reset email before choosing a new password.`,
          variant: "destructive",
        });
      }

      if (previewUrl && reset?.sent && reset?.deliveryMode === "smtp") {
        openManagedSecretDialog({
          title: "Password Reset Email Preview",
          description: `Email delivery is configured with a preview URL. The password reset link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }

      await Promise.all([loadManagedUsers(), loadPendingResetRequests(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Reset Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      resetPasswordLocksRef.current.delete(user.id);
    }
  }, [loadDevMailOutbox, loadManagedUsers, loadPendingResetRequests, openManagedSecretDialog, toast]);

  const handleResendManagedUserActivation = useCallback(async (user: ManagedUser) => {
    if (resendActivationLocksRef.current.has(user.id)) return;

    resendActivationLocksRef.current.add(user.id);
    try {
      const response = await resendManagedUserActivation(user.id);
      const activation = response?.activation as ActivationDeliveryPayload | undefined;
      const recipientEmail = String(activation?.recipientEmail || user.email || "");
      const expiresAt = formatActivationExpiry(activation?.expiresAt);
      const previewUrl = String(activation?.previewUrl || "");

      if (isDevOutboxActivation(activation)) {
        toast({
          title: "Activation Reissued",
          description: `Activation email for ${user.username} was captured in the local development outbox.`,
        });
        openManagedSecretDialog({
          title: "Local Activation Email Preview",
          description: `SMTP is not configured, so the reissued activation email was written to the local development outbox instead. Open this preview URL and follow the activation link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (activation?.sent) {
        toast({
          title: "Activation Reissued",
          description: `Activation email resent to ${recipientEmail || user.username}.`,
        });
      } else {
        openManagedSecretDialog({
          title: "Activation Email Not Sent",
          description:
            activation?.errorMessage
              ? `The activation email could not be resent: ${activation.errorMessage}. The account remains pending activation until delivery succeeds.`
              : "The activation email could not be resent. The account remains pending activation until delivery succeeds.",
          value: previewUrl || undefined,
        });
        toast({
          title: "Activation Still Pending",
          description: `${user.username} remains pending activation until the email is delivered.`,
          variant: "destructive",
        });
      }

      if (previewUrl && activation?.sent && activation?.deliveryMode === "smtp") {
        openManagedSecretDialog({
          title: "Activation Email Preview",
          description: `Email delivery is configured with a preview URL. The activation link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }

      await Promise.all([loadManagedUsers(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Activation Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      resendActivationLocksRef.current.delete(user.id);
    }
  }, [loadDevMailOutbox, loadManagedUsers, openManagedSecretDialog, toast]);

  const handleManagedBanToggle = useCallback(async (user: ManagedUser) => {
    const nextIsBanned = !Boolean(user.isBanned);
    if (!window.confirm(`${nextIsBanned ? "Ban" : "Unban"} ${user.username}?`)) return;

    try {
      await updateManagedUserStatus(user.id, {
        isBanned: nextIsBanned,
      });
      toast({
        title: nextIsBanned ? "Account Banned" : "Account Unbanned",
        description: `${user.username} has been ${nextIsBanned ? "banned" : "unbanned"}.`,
      });
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Status Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    }
  }, [loadManagedUsers, loadPendingResetRequests, toast]);

  const handleDeleteManagedUser = useCallback(async (user: ManagedUser) => {
    if (deleteManagedUserLocksRef.current.has(user.id)) return;

    deleteManagedUserLocksRef.current.add(user.id);
    setDeletingManagedUserId(user.id);
    try {
      await deleteManagedUserAccount(user.id);
      if (managedSelectedUser?.id === user.id) {
        handleManagedDialogChange(false);
      }
      toast({
        title: "Account Deleted",
        description: `${user.username} has been deleted safely.`,
      });
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Delete Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      deleteManagedUserLocksRef.current.delete(user.id);
      if (isMountedRef.current) {
        setDeletingManagedUserId((current) => (current === user.id ? null : current));
      }
    }
  }, [handleManagedDialogChange, loadManagedUsers, loadPendingResetRequests, managedSelectedUser, toast]);

  const handleDeleteDevMailOutboxEntry = useCallback(async (previewId: string) => {
    const normalizedId = String(previewId || "").trim();
    if (!normalizedId || deleteDevMailPreviewLocksRef.current.has(normalizedId)) return;

    deleteDevMailPreviewLocksRef.current.add(normalizedId);
    setDeletingDevMailOutboxId(normalizedId);
    try {
      await deleteDevMailOutboxPreview(normalizedId);
      toast({
        title: "Email Preview Deleted",
        description: "The local mail preview has been removed.",
      });
      await loadDevMailOutbox();
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Delete Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      deleteDevMailPreviewLocksRef.current.delete(normalizedId);
      if (isMountedRef.current) {
        setDeletingDevMailOutboxId((current) => (current === normalizedId ? null : current));
      }
    }
  }, [loadDevMailOutbox, toast]);

  const handleClearDevMailOutbox = useCallback(async () => {
    if (clearingDevMailOutbox) return;

    setClearingDevMailOutbox(true);
    try {
      const response = await clearDevMailOutboxPreviews();
      toast({
        title: "Mail Outbox Cleared",
        description: `${response?.deletedCount ?? 0} email preview(s) removed.`,
      });
      await loadDevMailOutbox();
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Clear Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) {
        setClearingDevMailOutbox(false);
      }
    }
  }, [clearingDevMailOutbox, loadDevMailOutbox, toast]);

  return {
    currentUser,
    profileLoading,
    canEditSystemSettings,
    canAccessAccountSecurity,
    isSuperuser,
    currentUserRole,
    categories,
    selectedCategory,
    setSelectedCategory,
    currentCategory,
    isRolePermissionCategory,
    isSecurityCategory,
    roleSections,
    categoryDirtyMap,
    dirtyCount,
    saving,
    renderSettingCard,
    saveBar: {
      dirtyCount,
      saving,
      onSave: () => void handleSave(),
    },
    security: {
      confirmPasswordInput,
      createEmailInput,
      createFullNameInput,
      createRoleInput,
      createUsernameInput,
      creatingManagedUser,
      currentPasswordInput,
      currentUserRole,
      devMailOutboxEnabled,
      devMailOutboxEntries,
      deletingDevMailOutboxId,
      clearingDevMailOutbox,
      devMailOutboxLoading,
      isSuperuser,
      managedUsers,
      deletingManagedUserId,
      managedUsersLoading,
      newPasswordInput,
      onChangePassword: () => void handleChangePassword(),
      onChangeUsername: () => void handleChangeUsername(),
      onConfirmPasswordInputChange: setConfirmPasswordInput,
      onCreateEmailInputChange: setCreateEmailInput,
      onCreateFullNameInputChange: setCreateFullNameInput,
      onCreateManagedUser: () => void handleCreateManagedUser(),
      onCreateRoleInputChange: setCreateRoleInput,
      onCreateUsernameInputChange: setCreateUsernameInput,
      onCurrentPasswordInputChange: setCurrentPasswordInput,
      onClearDevMailOutbox: () => void handleClearDevMailOutbox(),
      onDeleteDevMailOutboxEntry: (previewId: string) => void handleDeleteDevMailOutboxEntry(previewId),
      onDeleteManagedUser: (user: ManagedUser) => void handleDeleteManagedUser(user),
      onDevMailOutboxRefresh: () => void refreshDevMailOutboxSection(),
      onEditManagedUser: openManagedEditor,
      onManagedBanToggle: (user: ManagedUser) => void handleManagedBanToggle(user),
      onManagedUsersRefresh: () => void refreshManagedUsersSection(),
      onManagedResetPassword: (user: ManagedUser) => void handleResetManagedUserPassword(user),
      onManagedResendActivation: (user: ManagedUser) => void handleResendManagedUserActivation(user),
      onNewPasswordInputChange: setNewPasswordInput,
      onPendingResetRequestsRefresh: () => void refreshPendingResetRequestsSection(),
      onUsernameInputChange: setUsernameInput,
      passwordSaving,
      pendingResetRequests,
      pendingResetRequestsLoading,
      usernameInput,
      usernameSaving,
    },
    managedDialog: {
      confirmCriticalOpen,
      managedDialogOpen,
      managedEmailInput,
      managedFullNameInput,
      managedIsBanned,
      managedRoleInput,
      managedSaving,
      managedSelectedUser,
      managedStatusInput,
      managedUsernameInput,
      onCloseManagedDialog: () => handleManagedDialogChange(false),
      onConfirmCriticalOpenChange: setConfirmCriticalOpen,
      onConfirmManagedSave: () => void handleSaveManagedUser(),
      onManagedDialogOpenChange: handleManagedDialogChange,
      onManagedEmailInputChange: setManagedEmailInput,
      onManagedFullNameInputChange: setManagedFullNameInput,
      onManagedIsBannedChange: setManagedIsBanned,
      onManagedRoleInputChange: setManagedRoleInput,
      onManagedStatusInputChange: setManagedStatusInput,
      onManagedUsernameInputChange: setManagedUsernameInput,
      onSaveCriticalSettings: async () => {
        await persistChanges(true);
      },
      saving,
    },
    managedSecretDialog: {
      description: managedSecretDialogDescription,
      onOpenChange: setManagedSecretDialogOpen,
      open: managedSecretDialogOpen,
      title: managedSecretDialogTitle,
      value: managedSecretDialogValue,
    },
    loadingState: {
      loading,
      profileLoading,
    },
  };
}
