import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SettingsSaveBarProps {
  dirtyCount: number;
  onSave: () => void;
  saving: boolean;
}

export function SettingsSaveBar({ dirtyCount, onSave, saving }: SettingsSaveBarProps) {
  return (
    <Card className="border-primary/40 bg-background/95 shadow-sm" data-floating-ai-avoid="true">
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
          <Button onClick={onSave} disabled={dirtyCount === 0 || saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </span>
      </CardContent>
    </Card>
  );
}
