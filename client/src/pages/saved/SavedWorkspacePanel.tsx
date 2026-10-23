import { AlertTriangle, BookMarked, ChevronDown, Clock3, Copy, HardDrive } from "lucide-react";
import {
  formatSavedFileSize,
  type SavedWorkspaceSummary,
  type SavedWorkspaceView,
} from "@/pages/saved/saved-workspace";

type SavedWorkspacePanelProps = {
  activeView: SavedWorkspaceView;
  summary?: SavedWorkspaceSummary | undefined;
  onViewChange: (view: SavedWorkspaceView) => void;
};

const workspaceItems = [
  { id: "all", label: "All files", icon: BookMarked },
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
  const activeItem = workspaceItems.find((item) => item.id === activeView) ?? workspaceItems[0];
  const ActiveIcon = activeItem.icon;
  return (
    <section
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2"
      aria-label="Saved workspace filters"
    >
      <div className="flex max-w-full items-center gap-2">
        <label htmlFor="saved-workspace-view" className="sr-only">Saved workspace views</label>
        <div className="relative w-40 min-w-0 max-w-full">
          <ActiveIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <select
            id="saved-workspace-view"
            value={activeView}
            onChange={(event) => {
              const nextView = workspaceItems.find((item) => item.id === event.target.value);
              if (nextView) onViewChange(nextView.id);
            }}
            aria-label="Saved workspace views"
            className="h-11 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-8 text-sm font-medium text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-9"
            data-testid="select-saved-workspace-view"
          >
            {workspaceItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>

      {summary && summary.loadedFiles > 0 ? (
        <div className="ml-auto min-w-max max-w-full text-right text-xs text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:gap-x-3" role="group" aria-label="Loaded page totals">
          <span className="block">On this page:</span>
          <div className="mt-0.5 flex flex-wrap justify-end gap-x-2 gap-y-1 sm:mt-0 sm:gap-x-3">
            <p className="whitespace-nowrap"><span className="hidden sm:inline">Rows </span><span className="font-medium tabular-nums text-foreground">{summary.loadedRows.toLocaleString()}</span><span className="sm:hidden"> rows</span></p>
            <p className="whitespace-nowrap"><span className="sr-only sm:not-sr-only">Storage </span><span className="font-medium text-foreground">{formatSavedFileSize(summary.loadedSizeBytes)}</span></p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
