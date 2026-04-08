import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMobileKeyboardState } from "@/hooks/use-mobile-keyboard-state";
import { cn } from "@/lib/utils";

interface SettingsSaveBarProps {
  dirtyCount: number;
  onSave: () => void;
  saving: boolean;
}

export function SettingsSaveBar({ dirtyCount, onSave, saving }: SettingsSaveBarProps) {
  const keyboardOpen = useMobileKeyboardState();

  return (
    <Card
      className={cn(
        "border-primary/40 bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:shadow-sm sm:backdrop-blur-0",
        keyboardOpen ? "static shadow-sm backdrop-blur-0" : "sticky bottom-0 z-[var(--z-sticky-content)]",
      )}
      data-floating-ai-avoid="true"
    >
      <CardContent
        className="flex flex-col gap-3 p-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:flex-row sm:items-center sm:justify-between"
      >
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
