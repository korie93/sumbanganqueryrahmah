import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getMe,
  getSettings,
  getSuperuserManagedUsers,
  updateMyCredentials,
  updateSetting,
  updateSuperuserManagedUserCredentials,
} from "@/lib/api";
import { SettingCard } from "@/pages/settings/SettingCard";
import type {
  CurrentUser,
  ManagedUser,
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

export function useSettingsController() {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const settingsRequestIdRef = useRef(0);
  const managedUsersRequestIdRef = useRef(0);
  const bootstrapRequestIdRef = useRef(0);

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
  const [managedDialogOpen, setManagedDialogOpen] = useState(false);
  const [managedSelectedUser, setManagedSelectedUser] = useState<ManagedUser | null>(
    null,
  );
  const [managedUsernameInput, setManagedUsernameInput] = useState("");
  const [managedPasswordInput, setManagedPasswordInput] = useState("");
  const [managedConfirmPasswordInput, setManagedConfirmPasswordInput] = useState("");
  const [managedSaving, setManagedSaving] = useState(false);
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
      bootstrapRequestIdRef.current += 1;
    };
  }, []);

  const canEditSystemSettings =
    currentUser?.role === "admin" || currentUser?.role === "superuser";
  const isSuperuser = currentUser?.role === "superuser";
  const canAccessAccountSecurity = currentUser?.role === "superuser";
  const currentUserRole = currentUser?.role ?? "";

  const syncLocalUser = useCallback((nextUser: CurrentUser) => {
    localStorage.setItem("username", nextUser.username);
    localStorage.setItem("role", nextUser.role);
    localStorage.setItem(
      "user",
      JSON.stringify({
        username: nextUser.username,
        role: nextUser.role,
      }),
    );
    window.dispatchEvent(new CustomEvent("profile-updated", { detail: nextUser }));
  }, []);

  const forceLogoutAfterPasswordChange = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    localStorage.removeItem("activityId");
    localStorage.removeItem("activeTab");
    localStorage.removeItem("lastPage");
    localStorage.removeItem("selectedImportId");
    localStorage.removeItem("selectedImportName");
    localStorage.removeItem("fingerprint");
    sessionStorage.removeItem("collection_staff_nickname");
    sessionStorage.removeItem("collection_staff_nickname_auth");
    localStorage.setItem("forceLogout", "true");
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
  }, [loadManagedUsers, loadSettings, toast]);

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
        role: String(response?.user?.role || currentUser.role),
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
    setManagedUsernameInput(user.username);
    setManagedPasswordInput("");
    setManagedConfirmPasswordInput("");
    setManagedDialogOpen(true);
  }, []);

  const handleManagedDialogChange = useCallback((open: boolean) => {
    setManagedDialogOpen(open);
    if (!open) {
      setManagedSelectedUser(null);
      setManagedUsernameInput("");
      setManagedPasswordInput("");
      setManagedConfirmPasswordInput("");
    }
  }, []);

  const handleSaveManagedUser = useCallback(async () => {
    if (!managedSelectedUser || managedSaving) return;

    const payload: { newUsername?: string; newPassword?: string } = {};
    const normalizedUsername = managedUsernameInput.trim().toLowerCase();

    if (normalizedUsername !== managedSelectedUser.username) {
      if (!CREDENTIAL_USERNAME_REGEX.test(normalizedUsername)) {
        toast({
          title: "Validation Error",
          description: "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
          variant: "destructive",
        });
        return;
      }
      payload.newUsername = normalizedUsername;
    }

    if (managedPasswordInput) {
      if (!isStrongPassword(managedPasswordInput)) {
        toast({
          title: "Validation Error",
          description:
            "New password must be at least 8 characters and include at least one letter and one number.",
          variant: "destructive",
        });
        return;
      }

      if (managedPasswordInput !== managedConfirmPasswordInput) {
        toast({
          title: "Validation Error",
          description: "Confirm password does not match.",
          variant: "destructive",
        });
        return;
      }

      payload.newPassword = managedPasswordInput;
    }

    if (!payload.newUsername && !payload.newPassword) {
      toast({
        title: "No Changes",
        description: "No credential changes to save.",
      });
      return;
    }

    setManagedSaving(true);
    try {
      await updateSuperuserManagedUserCredentials(managedSelectedUser.id, payload);
      toast({
        title: "Credentials Updated",
        description: `Updated credentials for ${managedSelectedUser.username}.`,
      });
      if (!isMountedRef.current) return;
      handleManagedDialogChange(false);
      await loadManagedUsers();
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
    loadManagedUsers,
    managedConfirmPasswordInput,
    managedPasswordInput,
    managedSaving,
    managedSelectedUser,
    managedUsernameInput,
    toast,
  ]);

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
      currentPasswordInput,
      currentUserRole,
      isSuperuser,
      managedUsers,
      managedUsersLoading,
      newPasswordInput,
      onChangePassword: () => void handleChangePassword(),
      onChangeUsername: () => void handleChangeUsername(),
      onConfirmPasswordInputChange: setConfirmPasswordInput,
      onCurrentPasswordInputChange: setCurrentPasswordInput,
      onEditManagedUser: openManagedEditor,
      onNewPasswordInputChange: setNewPasswordInput,
      onUsernameInputChange: setUsernameInput,
      passwordSaving,
      usernameInput,
      usernameSaving,
    },
    managedDialog: {
      confirmCriticalOpen,
      managedConfirmPasswordInput,
      managedDialogOpen,
      managedPasswordInput,
      managedSaving,
      managedSelectedUser,
      managedUsernameInput,
      onCloseManagedDialog: () => handleManagedDialogChange(false),
      onConfirmCriticalOpenChange: setConfirmCriticalOpen,
      onConfirmManagedSave: () => void handleSaveManagedUser(),
      onManagedConfirmPasswordInputChange: setManagedConfirmPasswordInput,
      onManagedDialogOpenChange: handleManagedDialogChange,
      onManagedPasswordInputChange: setManagedPasswordInput,
      onManagedUsernameInputChange: setManagedUsernameInput,
      onSaveCriticalSettings: async () => {
        await persistChanges(true);
      },
      saving,
    },
    loadingState: {
      loading,
      profileLoading,
    },
  };
}
