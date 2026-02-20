import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Save, Settings2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { getSettings, updateSetting } from "@/lib/api";

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

const categoryOrder = [
  "General",
  "Security",
  "AI & Search",
  "Data Management",
  "Backup & Restore",
  "Roles & Permissions",
  "System Monitoring",
];

const normalizeErrorPayload = (rawError: unknown): { message: string; requiresConfirmation?: boolean } => {
  const fallback = { message: "Gagal kemas kini setting." };
  if (!rawError || typeof rawError !== "object") return fallback;
  const anyError = rawError as { message?: string };
  const msg = String(anyError.message || "");
  const jsonPart = msg.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(jsonPart);
    return {
      message: String(parsed?.message || fallback.message),
      requiresConfirmation: parsed?.requiresConfirmation === true,
    };
  } catch {
    return { message: msg || fallback.message };
  }
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<SettingCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [draftValues, setDraftValues] = useState<Record<string, string | number | boolean | null>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [confirmCriticalOpen, setConfirmCriticalOpen] = useState(false);

  const loadSettings = async () => {
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
      if (!selectedCategory && sorted.length > 0) {
        setSelectedCategory(sorted[0].id);
      } else if (selectedCategory && !sorted.some((cat: SettingCategory) => cat.id === selectedCategory)) {
        setSelectedCategory(sorted[0]?.id || "");
      }
    } catch (error: unknown) {
      const parsed = normalizeErrorPayload(error);
      toast({
        title: "Load Settings Gagal",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const getEffectiveValue = (setting: SettingItem) =>
    Object.prototype.hasOwnProperty.call(draftValues, setting.key)
      ? draftValues[setting.key]
      : setting.value;

  const markDirty = (key: string, value: string | number | boolean | null) => {
    setDraftValues((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

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
            title: `Gagal simpan: ${key}`,
            description: parsed.message,
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Settings dikemaskini",
        description: `${keys.length} setting berjaya disimpan.`,
      });
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

  const renderControl = (setting: SettingItem) => {
    const value = getEffectiveValue(setting);
    const disabled = !setting.permission.canEdit || saving;
    const asString = String(value ?? "");

    if (setting.type === "boolean") {
      const checked = String(value).toLowerCase() === "true";
      return (
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={(checkedValue) => markDirty(setting.key, checkedValue)}
        />
      );
    }

    if (setting.type === "select") {
      return (
        <Select
          value={asString}
          disabled={disabled}
          onValueChange={(selected) => markDirty(setting.key, selected)}
        >
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Pilih nilai" />
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
          onChange={(e) => markDirty(setting.key, e.target.value)}
          rows={3}
          className="max-w-2xl"
        />
      );
    }

    return (
      <Input
        type={setting.type === "number" ? "number" : setting.type === "timestamp" ? "datetime-local" : "text"}
        value={asString}
        disabled={disabled}
        onChange={(e) => markDirty(setting.key, e.target.value)}
        className="max-w-sm"
      />
    );
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-border/60 bg-background/70">
            <CardContent className="p-10 text-center text-muted-foreground">Memuatkan tetapan sistem...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-6">
        <Card className="col-span-12 lg:col-span-3 border-border/60 bg-background/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Settings Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.map((category) => {
              const categoryDirty = category.settings.filter((setting) => dirtyKeys.has(setting.key)).length;
              const active = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
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
          <Card className="border-border/60 bg-background/70 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-2xl">{currentCategory?.name || "System Settings"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {currentCategory?.description || "Konfigurasi sistem enterprise berasaskan role dan audit."}
              </p>
            </CardHeader>
          </Card>

          {(currentCategory?.settings || []).map((setting) => (
            <Card key={setting.key} className="border-border/60 bg-background/70 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{setting.label}</h3>
                      {setting.isCritical && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Critical
                        </Badge>
                      )}
                      {dirtyKeys.has(setting.key) && (
                        <Badge variant="secondary">Unsaved</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{setting.description || "-"}</p>
                    <p className="text-xs text-muted-foreground">Key: {setting.key}</p>
                  </div>
                  <div className="w-full lg:w-auto">{renderControl(setting)}</div>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="sticky bottom-4 z-10">
            <Card className="border-primary/40 bg-background/95 backdrop-blur">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  {dirtyCount > 0 ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>{dirtyCount} perubahan belum disimpan</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Tiada perubahan belum simpan</span>
                    </>
                  )}
                </div>
                <Button onClick={handleSave} disabled={dirtyCount === 0 || saving} className="gap-2">
                  <Save className="w-4 h-4" />
                  {saving ? "Menyimpan..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmCriticalOpen} onOpenChange={setConfirmCriticalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sahkan Perubahan Critical</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan mengubah tetapan kritikal sistem. Teruskan hanya jika perubahan ini telah disahkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={async () => {
                setConfirmCriticalOpen(false);
                await persistChanges(true);
              }}
            >
              Ya, Simpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
