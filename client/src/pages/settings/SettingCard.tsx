import { memo, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
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

function humanizeSettingKey(key: string) {
  return key
    .split(/[_-]+/)
    .map((segment) => {
      const normalizedSegment = segment.trim();
      if (!normalizedSegment) {
        return "";
      }

      return normalizedSegment.charAt(0).toUpperCase() + normalizedSegment.slice(1);
    })
    .filter(Boolean)
    .join(" ");
}

export const SettingCard = memo(function SettingCard({
  setting,
  value,
  isDirty,
  saving,
  onChange,
}: SettingCardProps) {
  const isMobile = useIsMobile();
  const disabled = !setting.permission.canEdit || saving;
  const asString = String(value ?? "");
  const sanitizedSettingKey = setting.key.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const settingLabel = setting.label.trim() || humanizeSettingKey(setting.key);
  const settingTitleId = `setting-card-title-${sanitizedSettingKey}`;
  const settingControlId = `setting-card-control-${sanitizedSettingKey}`;
  const settingControlName = `settingValue-${sanitizedSettingKey}`;
  const settingDescriptionId = `setting-card-description-${sanitizedSettingKey}`;
  const actionHint = getSettingActionTooltip(setting);
  const controlClassName = isMobile ? "w-full" : "w-full max-w-sm";

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
          id={settingControlId}
          checked={checked}
          aria-labelledby={settingTitleId}
          aria-describedby={settingDescriptionId}
          disabled={disabled}
          onCheckedChange={(checkedValue) => handleValueChange(checkedValue)}
          title={actionHint}
        />
      );
    }

    if (setting.type === "select") {
      return (
        <Select value={asString} disabled={disabled} onValueChange={(selected) => handleValueChange(selected)}>
          <SelectTrigger
            id={settingControlId}
            aria-label={settingLabel}
            aria-describedby={settingDescriptionId}
            className={controlClassName}
            title={actionHint}
          >
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
          id={settingControlId}
          name={settingControlName}
          aria-labelledby={settingTitleId}
          aria-describedby={settingDescriptionId}
          value={asString}
          disabled={disabled}
          onChange={(event) => handleValueChange(event.target.value)}
          rows={3}
          className={isMobile ? "w-full" : "max-w-2xl"}
          title={actionHint}
          autoComplete="off"
        />
      );
    }

    const inputValue = setting.type === "timestamp" ? toDateTimeLocalInputValue(asString) : asString;
    return (
      <Input
        id={settingControlId}
        name={settingControlName}
        aria-labelledby={settingTitleId}
        aria-describedby={settingDescriptionId}
        type={setting.type === "number" ? "number" : setting.type === "timestamp" ? "datetime-local" : "text"}
        value={inputValue}
        disabled={disabled}
        onChange={(event) => handleValueChange(event.target.value)}
        className={controlClassName}
        title={actionHint}
        autoComplete="off"
      />
    );
  };

  const descriptionLabel = setting.description || "No description available for this setting.";
  return (
    <section aria-labelledby={settingTitleId} className="min-w-0 border-b border-border py-4 [contain-intrinsic-size:140px] [content-visibility:auto]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={settingTitleId} className="text-sm font-medium">{settingLabel}</h3>
              {setting.isCritical ? (
                <Badge variant="destructive" className="gap-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Critical
                </Badge>
              ) : null}
              {isDirty ? <Badge variant="secondary" className="rounded-full">Unsaved</Badge> : null}
            </div>
            <p id={settingDescriptionId} className="text-xs leading-5 text-muted-foreground">{descriptionLabel}</p>
            <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">Key: {setting.key}</p>
          </div>
          <div className="w-full shrink-0 lg:w-80">{renderControl()}</div>
        </div>
    </section>
  );
});
