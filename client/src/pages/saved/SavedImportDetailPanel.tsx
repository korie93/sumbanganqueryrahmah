import { BarChart3, BookOpen, CalendarDays, Edit2, Eye, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatSavedFileSize,
  getSavedImportSizeBytes,
  getSavedImportStatus,
} from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";

type SavedImportDetailPanelProps = {
  activeImport: ImportItem | null;
  actionsDisabled: boolean;
  duplicateHashCounts: ReadonlyMap<string, number>;
  isSuperuser: boolean;
  formatDate: (dateStr: string) => string;
  onAnalysis: (item: ImportItem) => void;
  onDelete: (item: ImportItem) => void;
  onRename: (item: ImportItem) => void;
  onView: (item: ImportItem) => void;
};

const statusToneClassName = {
  default: "border-border bg-muted/45 text-foreground",
  success: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  danger: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
} as const;

function DetailMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="ops-eyebrow">{label}</p>
        <p className="truncate text-xs font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function SavedImportDetailPanel({
  activeImport,
  actionsDisabled,
  duplicateHashCounts,
  formatDate,
  isSuperuser,
  onAnalysis,
  onDelete,
  onRename,
  onView,
}: SavedImportDetailPanelProps) {
  if (!activeImport) {
    return (
      <section
        className="rounded-xl border border-dashed border-border/70 bg-background/65 p-4 text-sm text-muted-foreground"
        aria-label="Saved file details"
      >
        Select a saved file to review its rows, size, status, and quick actions.
      </section>
    );
  }

  const status = getSavedImportStatus(activeImport, duplicateHashCounts);
  const rowCount = typeof activeImport.rowCount === "number" ? activeImport.rowCount : 0;
  const owner = String(activeImport.createdBy || "").trim() || "Unknown";

  return (
    <section
      className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm"
      aria-label={`Saved file details for ${activeImport.name}`}
      data-testid="saved-import-detail-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="ops-eyebrow">Selected file</p>
          <h2 className="break-words text-base font-semibold text-foreground">{activeImport.name}</h2>
          <p className="break-words text-xs text-muted-foreground">{activeImport.filename}</p>
        </div>
        <Badge className={statusToneClassName[status.tone]} variant="outline">
          {status.label}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <DetailMetric icon={BookOpen} label="Rows" value={rowCount.toLocaleString()} />
        <DetailMetric icon={CalendarDays} label="Imported" value={formatDate(activeImport.createdAt)} />
        <DetailMetric icon={UserRound} label="Owner" value={owner} />
        <DetailMetric
          icon={BarChart3}
          label="Size"
          value={formatSavedFileSize(getSavedImportSizeBytes(activeImport))}
        />
      </div>

      <div className="mt-4 grid gap-2">
        <Button type="button" onClick={() => onView(activeImport)} data-testid="button-detail-view">
          <Eye className="mr-2 h-4 w-4" />
          Open Viewer
        </Button>
        <Button type="button" variant="outline" onClick={() => onAnalysis(activeImport)} data-testid="button-detail-analysis">
          <BarChart3 className="mr-2 h-4 w-4" />
          Analyze
        </Button>
        {isSuperuser ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onRename(activeImport)}
              disabled={actionsDisabled}
              data-testid="button-detail-rename"
            >
              <Edit2 className="mr-2 h-4 w-4" />
              Rename
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={() => onDelete(activeImport)}
              disabled={actionsDisabled}
              data-testid="button-detail-delete"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
