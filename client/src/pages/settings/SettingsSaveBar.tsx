import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMobileKeyboardState } from "@/hooks/use-mobile-keyboard-state";
import { cn } from "@/lib/utils";
import type { SettingChangeSummary } from "@/pages/settings/types";

interface SettingsSaveBarProps {
  changeSummary: SettingChangeSummary[];
  dirtyCount: number;
  onSave: () => void;
  saving: boolean;
}

export function SettingsSaveBar({
  changeSummary,
  dirtyCount,
  onSave,
  saving,
}: SettingsSaveBarProps) {
  const keyboardOpen = useMobileKeyboardState();
  const visibleChanges = changeSummary.slice(0, 3);
  const remainingChangeCount = Math.max(0, changeSummary.length - visibleChanges.length);

  return (
    <Card
      className={cn(
        "border-border bg-card shadow-none sm:static",
        keyboardOpen ? "static" : "sticky bottom-0 z-[var(--z-sticky-content)]",
      )}
      data-floating-ai-avoid="true"
    >
      <CardContent
        className="flex flex-col gap-3 p-3 pb-[calc(var(--safe-area-inset-bottom)+0.75rem)] sm:flex-row sm:items-center sm:justify-between sm:p-4"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {dirtyCount > 0 ? (
              <>
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                <span>{dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                <span>No unsaved changes</span>
              </>
            )}
          </div>
          {visibleChanges.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Unsaved settings summary">
              {visibleChanges.map((change) => (
                <span
                  key={change.key}
                  className="max-w-full truncate rounded-full border border-border/70 px-2.5 py-1"
                  title={`${change.label}: ${change.previousValue} to ${change.nextValue}`}
                >
                  {change.label}: {change.nextValue}
                </span>
              ))}
              {remainingChangeCount > 0 ? (
                <span className="rounded-full border border-border/70 px-2.5 py-1">
                  +{remainingChangeCount} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <span title="Save all setting changes now.">
          <Button
            onClick={onSave}
            disabled={dirtyCount === 0 || saving}
            className="w-full gap-2 sm:w-auto"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </span>
      </CardContent>
    </Card>
  );
}
