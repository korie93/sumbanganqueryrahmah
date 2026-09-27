import { AlertTriangle, BookMarked, Clock3, Copy, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatSavedFileSize,
  type SavedWorkspaceSummary,
  type SavedWorkspaceView,
} from "@/pages/saved/saved-workspace";

type SavedWorkspacePanelProps = {
  activeView: SavedWorkspaceView;
  summary: SavedWorkspaceSummary;
  onViewChange: (view: SavedWorkspaceView) => void;
};

const workspaceItems = [
  { id: "all", label: "All", icon: BookMarked },
  { id: "recent", label: "Recent", icon: Clock3 },
  { id: "large", label: "Large", icon: HardDrive },
  { id: "duplicates", label: "Duplicates", icon: Copy },
  { id: "review", label: "Review", icon: AlertTriangle },
] satisfies Array<{
  id: SavedWorkspaceView;
  label: string;
  icon: typeof BookMarked;
}>;

export function SavedWorkspacePanel({
  activeView,
  summary,
  onViewChange,
}: SavedWorkspacePanelProps) {
  return (
    <section
      className="min-w-0 space-y-2"
      aria-label="Saved workspace filters"
    >
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label="Saved workspace views"
      >
        {workspaceItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const pressedProps = isActive
            ? { "aria-pressed": "true" as const }
            : { "aria-pressed": "false" as const };
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              {...pressedProps}
              className={cn(
                "h-11 justify-start gap-2 rounded-md border px-3 text-left md:h-9",
                isActive
                  ? "border-primary/45 bg-primary/10 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onViewChange(item.id)}
              data-testid={`button-saved-view-${item.id}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p>{summary.loadedFiles.toLocaleString()} on page · {summary.totalFiles.toLocaleString()} matching</p>
        <p>Rows <span className="font-medium tabular-nums text-foreground">{summary.loadedRows.toLocaleString()}</span></p>
        <p>Storage <span className="font-medium text-foreground">{formatSavedFileSize(summary.loadedSizeBytes)}</span></p>
      </div>
    </section>
  );
}
