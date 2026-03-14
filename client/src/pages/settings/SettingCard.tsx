import { memo, useCallback } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { SettingItem } from "@/pages/settings/types";
import { getSettingActionTooltip, toDateTimeLocalInputValue } from "@/pages/settings/utils";

interface SettingCardProps {
  setting: SettingItem;
  value: string | number | boolean | null;
  isDirty: boolean;
  saving: boolean;
  onChange: (key: string, value: string | number | boolean | null) => void;
}

export const SettingCard = memo(function SettingCard({
  setting,
  value,
  isDirty,
  saving,
  onChange,
}: SettingCardProps) {
  const disabled = !setting.permission.canEdit || saving;
  const asString = String(value ?? "");
  const actionHint = getSettingActionTooltip(setting);

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
        <Select value={asString} disabled={disabled} onValueChange={(selected) => handleValueChange(selected)}>
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
          onChange={(event) => handleValueChange(event.target.value)}
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
        onChange={(event) => handleValueChange(event.target.value)}
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
              {setting.isCritical ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Critical
                </Badge>
              ) : null}
              {isDirty ? <Badge variant="secondary">Unsaved</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">Key: {setting.key}</p>
          </div>
          <div className="w-full lg:w-auto">{renderControl()}</div>
        </div>
      </CardContent>
    </Card>
  );
});
