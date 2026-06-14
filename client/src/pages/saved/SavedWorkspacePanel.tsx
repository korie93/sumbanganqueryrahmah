import { AlertTriangle, BookMarked, Clock3, Copy, Database, HardDrive } from "lucide-react";
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
    <aside
      className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm"
      aria-label="Saved workspace filters"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Database className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Workspace</h2>
          <p className="text-xs text-muted-foreground">
            {summary.loadedFiles.toLocaleString()} on page · {summary.totalFiles.toLocaleString()} matching
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-2 xl:grid-cols-1"
        role="group"
        aria-label="Saved workspace views"
      >
        {workspaceItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              aria-pressed={isActive}
              className={cn(
                "h-auto justify-start gap-2 rounded-lg border px-3 py-2 text-left",
                isActive
                  ? "border-primary/45 bg-primary/10 text-foreground"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onViewChange(item.id)}
              data-testid={`button-saved-view-${item.id}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate text-xs font-medium">{item.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs xl:grid-cols-1">
        <div className="rounded-lg border border-border/60 bg-muted/35 p-2">
          <p className="text-muted-foreground">Rows</p>
          <p className="font-semibold text-foreground">{summary.loadedRows.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/35 p-2">
          <p className="text-muted-foreground">Storage</p>
          <p className="font-semibold text-foreground">{formatSavedFileSize(summary.loadedSizeBytes)}</p>
        </div>
      </div>
    </aside>
  );
}
