import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Save, Settings2, ShieldCheck, Users, KeyRound, UserCog } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  getMe,
  getSettings,
  getSuperuserManagedUsers,
  updateMyCredentials,
  updateSetting,
  updateSuperuserManagedUserCredentials,
} from "@/lib/api";

type SettingType = "text" | "number" | "boolean" | "select" | "timestamp";

type SettingOption = {
  value: string;
  label: string;
};

type SettingItem = {
  key: string;
  label: string;
  description: string | null;
  type: SettingType;
  value: string;
  defaultValue: string | null;
  isCritical: boolean;
  updatedAt: string | null;
  permission: {
    canView: boolean;
    canEdit: boolean;
  };
  options: SettingOption[];
};

type SettingCategory = {
  id: string;
  name: string;
  description: string | null;
  settings: SettingItem[];
};

type CurrentUser = {
  id: string;
  username: string;
  role: string;
};

type ManagedUser = {
  id: string;
  username: string;
  role: string;
};

const categoryOrder = [
  "General",
  "Security",
  "AI & Search",
  "Data Management",
  "Backup & Restore",
  "Roles & Permissions",
  "System Monitoring",
];

const roleTabOrder = [
  "home",
  "import",
  "saved",
  "viewer",
  "general_search",
  "collection_report",
  "analysis",
  "dashboard",
  "monitor",
  "activity",
  "audit_logs",
  "backup",
  "settings",
];

const normalizeErrorPayload = (rawError: unknown): { message: string; requiresConfirmation?: boolean; code?: string } => {
  const fallback = { message: "Failed to update setting." };
  if (!rawError || typeof rawError !== "object") return fallback;
  const anyError = rawError as { message?: string };
  const msg = String(anyError.message || "");
  const jsonPart = msg.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(jsonPart);
    const parsedCode = typeof parsed?.error?.code === "string" ? parsed.error.code : undefined;
    const parsedMessage = String(parsed?.error?.message || parsed?.message || fallback.message);
    return {
      message: parsedMessage,
      requiresConfirmation: parsed?.requiresConfirmation === true,
      code: parsedCode,
    };
  } catch {
    return { message: msg || fallback.message };
  }
};

const getActionTooltip = (setting: SettingItem) => {
  if (setting.type === "boolean") return "Toggle ON/OFF to allow or block access.";
  if (setting.type === "select") return "Select an allowed value for this configuration.";
  if (setting.type === "number") return "Enter a valid numeric value for this setting.";
  if (setting.type === "timestamp") return "Set a date/time value for this setting.";
  return "Update this setting value.";
};

const getRoleSettingOrder = (key: string) => {
  const match = key.match(/^tab_(admin|user)_(.+)_enabled$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const suffix = match[2];
  const idx = roleTabOrder.indexOf(suffix);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
};

const toDateTimeLocalInputValue = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CREDENTIAL_USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;

const isStrongPassword = (value: string): boolean =>
  value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

type SettingCardProps = {
  setting: SettingItem;
  value: string | number | boolean | null;
  isDirty: boolean;
  saving: boolean;
  onChange: (key: string, value: string | number | boolean | null) => void;
};

const SettingCard = memo(function SettingCard({
  setting,
  value,
  isDirty,
  saving,
  onChange,
}: SettingCardProps) {
  const disabled = !setting.permission.canEdit || saving;
  const asString = String(value ?? "");
  const actionHint = getActionTooltip(setting);

  const handleValueChange = useCallback(
    (nextValue: string | number | boolean | null) => {
      onChange(setting.key, nextValue);
    },
    [onChange, setting.key],
  );

  const renderControl = () => {
    if (setting.type === "boolean") {
      const checked = String(value).toLowerCase() === "true";
      return (
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={(checkedValue) => handleValueChange(checkedValue)}
          title={actionHint}
          aria-label={actionHint}
        />
      );
    }

    if (setting.type === "select") {
      return (
        <Select
          value={asString}
          disabled={disabled}
          onValueChange={(selected) => handleValueChange(selected)}
        >
          <SelectTrigger className="w-full max-w-sm" title={actionHint} aria-label={actionHint}>
            <SelectValue placeholder="Select a value" />
          </SelectTrigger>
          <SelectContent>
            {(setting.options || []).map((option) => (
              <SelectItem key={`${setting.key}-${option.value}`} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (setting.key === "maintenance_message") {
      return (
        <Textarea
          value={asString}
          disabled={disabled}
          onChange={(e) => handleValueChange(e.target.value)}
          rows={3}
          className="max-w-2xl"
          title={actionHint}
          aria-label={actionHint}
        />
      );
    }

    const inputValue = setting.type === "timestamp" ? toDateTimeLocalInputValue(asString) : asString;
    return (
      <Input
        type={setting.type === "number" ? "number" : setting.type === "timestamp" ? "datetime-local" : "text"}
        value={inputValue}
        disabled={disabled}
        onChange={(e) => handleValueChange(e.target.value)}
        className="max-w-sm"
        title={actionHint}
        aria-label={actionHint}
      />
    );
  };

  return (
    <Card
      className="border-border/60 bg-background/70"
      style={{ contentVisibility: "auto", containIntrinsicSize: "140px" }}
    >
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{setting.label}</h3>
              <span
                className="text-muted-foreground"
                title={setting.description || "No description available for this setting."}
                aria-label={setting.description || "No description available for this setting."}
              >
                <Info className="w-3.5 h-3.5" />
              </span>
              {setting.isCritical && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Critical
                </Badge>
              )}
              {isDirty && <Badge variant="secondary">Unsaved</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Key: {setting.key}</p>
          </div>
          <div className="w-full lg:w-auto">{renderControl()}</div>
        </div>
      </CardContent>
    </Card>
  );
});

export default function SettingsPage() {
  const { toast } = useToast();
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
  const [managedSelectedUser, setManagedSelectedUser] = useState<ManagedUser | null>(null);
  const [managedUsernameInput, setManagedUsernameInput] = useState("");
  const [managedPasswordInput, setManagedPasswordInput] = useState("");
  const [managedConfirmPasswordInput, setManagedConfirmPasswordInput] = useState("");
  const [managedSaving, setManagedSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<SettingCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [draftValues, setDraftValues] = useState<Record<string, string | number | boolean | null>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [confirmCriticalOpen, setConfirmCriticalOpen] = useState(false);

  const canEditSystemSettings = currentUser?.role === "admin" || currentUser?.role === "superuser";
  const isSuperuser = currentUser?.role === "superuser";
  const canAccessAccountSecurity = currentUser?.role === "superuser";

  const syncLocalUser = useCallback((nextUser: CurrentUser) => {
    localStorage.setItem("username", nextUser.username);
    localStorage.setItem("role", nextUser.role);
    localStorage.setItem("user", JSON.stringify({
      username: nextUser.username,
      role: nextUser.role,
    }));
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
    setLoading(true);
    try {
      const response = await getSettings();
      const rawCategories = Array.isArray(response?.categories) ? response.categories : [];
      const sorted = [...rawCategories].sort((a: SettingCategory, b: SettingCategory) => {
        const ai = categoryOrder.indexOf(a.name);
        const bi = categoryOrder.indexOf(b.name);
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      setCategories(sorted);
      setSelectedCategory((prev) => {
        if (!prev && sorted.length > 0) return sorted[0].id;
        if (prev && !sorted.some((cat: SettingCategory) => cat.id === prev)) return sorted[0]?.id || "";
        return prev;
      });
    } catch (error: unknown) {
      const parsed = normalizeErrorPayload(error);
      toast({
        title: "Failed to Load Settings",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadManagedUsers = useCallback(async () => {
    setManagedUsersLoading(true);
    try {
      const response = await getSuperuserManagedUsers();
      setManagedUsers(Array.isArray(response?.users) ? response.users : []);
    } catch (error: unknown) {
      const parsed = normalizeErrorPayload(error);
      toast({
        title: "Failed to Load Managed Users",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      setManagedUsersLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setProfileLoading(true);
      try {
        const me = await getMe();
        if (cancelled) return;

        setCurrentUser(me);
        setUsernameInput(me.username);

        if (me.role === "admin" || me.role === "superuser") {
          await loadSettings();
        } else {
          setLoading(false);
          setCategories([]);
          setSelectedCategory("");
        }

        if (me.role === "superuser") {
          await loadManagedUsers();
        }
      } catch (error: unknown) {
        const parsed = normalizeErrorPayload(error);
        toast({
          title: "Failed to Load Profile",
          description: parsed.message,
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
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

  const currentCategory = categories.find((category) => category.id === selectedCategory) || null;
  const dirtyCount = dirtyKeys.size;
  const dirtyCriticalCount = Array.from(dirtyKeys).filter((key) => settingMap.get(key)?.isCritical).length;
  const isRolePermissionCategory = currentCategory?.name === "Roles & Permissions";
  const isSecurityCategory = currentCategory?.name === "Security";
  const categoryDirtyMap = useMemo(() => {
    const next = new Map<string, number>();
    if (dirtyKeys.size === 0) return next;
    for (const category of categories) {
      let count = 0;
      for (const setting of category.settings) {
        if (dirtyKeys.has(setting.key)) count++;
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
      .filter((setting) => setting.key.startsWith("tab_admin_") || setting.key === "canViewSystemPerformance")
      .filter((setting) => !isObsoleteAiToggle(setting))
      .sort((a, b) => getRoleSettingOrder(a.key) - getRoleSettingOrder(b.key) || a.label.localeCompare(b.label));
    const user = currentCategory.settings
      .filter((setting) => setting.key.startsWith("tab_user_"))
      .filter((setting) => !isObsoleteAiToggle(setting))
      .sort((a, b) => getRoleSettingOrder(a.key) - getRoleSettingOrder(b.key) || a.label.localeCompare(b.label));
    const other = currentCategory.settings
      .filter((setting) => !setting.key.startsWith("tab_admin_") && !setting.key.startsWith("tab_user_") && setting.key !== "canViewSystemPerformance")
      .sort((a, b) => a.label.localeCompare(b.label));
    return { admin, user, other };
  }, [isRolePermissionCategory, currentCategory]);

  const getEffectiveValue = (setting: SettingItem) =>
    Object.prototype.hasOwnProperty.call(draftValues, setting.key)
      ? draftValues[setting.key]
      : setting.value;

  const markDirty = useCallback(
    (key: string, value: string | number | boolean | null) => {
      const originalValue = settingMap.get(key)?.value ?? null;
      const sameAsOriginal = String(value ?? "") === String(originalValue ?? "");

      setDraftValues((prev) => {
        if (sameAsOriginal) {
          if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
          const { [key]: _removed, ...rest } = prev;
          return rest;
        }
        const currentValue = Object.prototype.hasOwnProperty.call(prev, key) ? prev[key] : originalValue;
        if (String(currentValue ?? "") === String(value ?? "")) return prev;
        return { ...prev, [key]: value };
      });

      setDirtyKeys((prev) => {
        const hasKey = prev.has(key);
        if (sameAsOriginal && !hasKey) return prev;
        if (!sameAsOriginal && hasKey) return prev;
        const next = new Set(prev);
        if (sameAsOriginal) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [settingMap],
  );

  const persistChanges = async (confirmCritical: boolean) => {
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
          const parsed = normalizeErrorPayload(error);
          if (parsed.requiresConfirmation && !confirmCritical) {
            setConfirmCriticalOpen(true);
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
      window.dispatchEvent(new CustomEvent("settings-updated", { detail: { source: "settings-page" } }));
      setDirtyKeys(new Set());
      setDraftValues({});
      await loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (dirtyCount === 0 || saving) return;
    if (dirtyCriticalCount > 0) {
      setConfirmCriticalOpen(true);
      return;
    }
    await persistChanges(false);
  };

  const renderSettingCard = (setting: SettingItem) => (
    <SettingCard
      key={setting.key}
      setting={setting}
      value={getEffectiveValue(setting)}
      isDirty={dirtyKeys.has(setting.key)}
      saving={saving}
      onChange={markDirty}
    />
  );

  const handleChangeUsername = async () => {
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
      toast({
        title: "No Changes",
        description: "Username is unchanged.",
      });
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
      setCurrentUser(nextUser);
      setUsernameInput(nextUser.username);
      syncLocalUser(nextUser);
      toast({
        title: "Username Updated",
        description: "Your username has been updated successfully.",
      });
    } catch (error: unknown) {
      const parsed = normalizeErrorPayload(error);
      toast({
        title: parsed.code || "Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleChangePassword = async () => {
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
        description: "New password must be at least 8 characters and include at least one letter and one number.",
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
      const parsed = normalizeErrorPayload(error);
      toast({
        title: parsed.code || "Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const openManagedEditor = (user: ManagedUser) => {
    setManagedSelectedUser(user);
    setManagedUsernameInput(user.username);
    setManagedPasswordInput("");
    setManagedConfirmPasswordInput("");
    setManagedDialogOpen(true);
  };

  const handleManagedDialogChange = (open: boolean) => {
    setManagedDialogOpen(open);
    if (!open) {
      setManagedSelectedUser(null);
      setManagedUsernameInput("");
      setManagedPasswordInput("");
      setManagedConfirmPasswordInput("");
    }
  };

  const handleSaveManagedUser = async () => {
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
          description: "New password must be at least 8 characters and include at least one letter and one number.",
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
      handleManagedDialogChange(false);
      await loadManagedUsers();
    } catch (error: unknown) {
      const parsed = normalizeErrorPayload(error);
      toast({
        title: parsed.code || "Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      setManagedSaving(false);
    }
  };

  const renderAccountSecuritySection = () => (
    <div className="space-y-6">
      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Account Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Card className="border-border/60 bg-background/60">
            <CardHeader>
              <CardTitle className="text-base">My Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Username</p>
                  <Input
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    disabled={usernameSaving || passwordSaving}
                  />
                </div>
                <Button onClick={handleChangeUsername} disabled={usernameSaving || passwordSaving}>
                  {usernameSaving ? "Updating..." : "Change Username"}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Role (read only)</p>
                <Input value={currentUser.role} disabled />
              </div>

              <div className="border-t border-border/60 pt-6 space-y-4">
                <h3 className="text-sm font-semibold">Change Password</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Current Password</p>
                    <Input
                      type="password"
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      disabled={passwordSaving || usernameSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">New Password</p>
                    <Input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      disabled={passwordSaving || usernameSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Confirm Password</p>
                    <Input
                      type="password"
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      disabled={passwordSaving || usernameSaving}
                    />
                  </div>
                </div>
                <Button onClick={handleChangePassword} disabled={passwordSaving || usernameSaving}>
                  {passwordSaving ? "Updating..." : "Change Password"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      {isSuperuser && (
        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              User Credential Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedUsersLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">Loading users...</TableCell>
                  </TableRow>
                ) : managedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">No admin/user accounts found.</TableCell>
                  </TableRow>
                ) : (
                  managedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.username}</TableCell>
                      <TableCell><Badge variant="secondary">{user.role}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" onClick={() => openManagedEditor(user)}>Edit credentials</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (profileLoading || (canEditSystemSettings && loading)) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">
              {profileLoading ? "Loading account profile..." : "Loading system settings..."}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">Unable to load account profile.</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {!canEditSystemSettings && (
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">
              Hanya admin dan superuser dibenarkan mengakses Settings.
            </CardContent>
          </Card>
        )}

        {canEditSystemSettings && (
          <div className="grid grid-cols-12 gap-6">
            <Card className="col-span-12 lg:col-span-3 border-border/60 bg-background/70">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Settings Categories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {categories.map((category) => {
                  const categoryDirty = categoryDirtyMap.get(category.id) || 0;
                  const active = selectedCategory === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category.id)}
                      title={category.description || `Open ${category.name} settings`}
                      className={`w-full text-left rounded-md border px-3 py-2 transition ${
                        active ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{category.name}</span>
                        {categoryDirty > 0 && <Badge variant="secondary">{categoryDirty}</Badge>}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <div className="col-span-12 lg:col-span-9 space-y-4">
              <Card className="border-border/60 bg-background/70">
                <CardHeader>
                  <CardTitle className="text-2xl">{currentCategory?.name || "System Settings"}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {currentCategory?.description || "Enterprise system configuration with role-based access and audit."}
                  </p>
                </CardHeader>
              </Card>

              {isSecurityCategory && canAccessAccountSecurity && renderAccountSecuritySection()}

              {isRolePermissionCategory && roleSections ? (
                <div className="space-y-4">
                  <Card className="border-border/60 bg-background/70">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        Admin Tab Permissions
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Control which tabs admin users can access.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {roleSections.admin.map(renderSettingCard)}
                    </CardContent>
                  </Card>

                  <Card className="border-border/60 bg-background/70">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        User Tab Permissions
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Control which tabs standard users can access.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {roleSections.user.map(renderSettingCard)}
                    </CardContent>
                  </Card>

                  {roleSections.other.length > 0 && (
                    <Card className="border-border/60 bg-background/70">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Other Permission Settings</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {roleSections.other.map(renderSettingCard)}
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                (currentCategory?.settings || []).map(renderSettingCard)
              )}

              <div className="z-10">
                <Card className="border-primary/40 bg-background/95">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      {dirtyCount > 0 ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span>{dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>No unsaved changes</span>
                        </>
                      )}
                    </div>
                    <span title="Save all setting changes now.">
                      <Button onClick={handleSave} disabled={dirtyCount === 0 || saving} className="gap-2">
                        <Save className="w-4 h-4" />
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                    </span>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={managedDialogOpen} onOpenChange={handleManagedDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit credentials</DialogTitle>
            <DialogDescription>
              Update username and/or password for {managedSelectedUser?.username || "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Username</p>
              <Input
                value={managedUsernameInput}
                onChange={(e) => setManagedUsernameInput(e.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">New Password</p>
              <Input
                type="password"
                value={managedPasswordInput}
                onChange={(e) => setManagedPasswordInput(e.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Confirm Password</p>
              <Input
                type="password"
                value={managedConfirmPasswordInput}
                onChange={(e) => setManagedConfirmPasswordInput(e.target.value)}
                disabled={managedSaving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleManagedDialogChange(false)} disabled={managedSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveManagedUser} disabled={managedSaving}>
              {managedSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCriticalOpen} onOpenChange={setConfirmCriticalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Critical Change</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to update critical system settings. Continue only if this change has been validated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={async () => {
                setConfirmCriticalOpen(false);
                await persistChanges(true);
              }}
            >
              Yes, Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
