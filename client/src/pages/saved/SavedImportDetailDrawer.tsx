import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Columns3,
  Eye,
  GitCompareArrows,
  HardDrive,
  Hash,
  History,
  Trash2,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatSavedFileSize,
  getSavedImportSizeBytes,
  getSavedImportStatus,
} from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";
import { useSavedImportDetailState } from "@/pages/saved/useSavedImportDetailState";

type SavedImportDetailDrawerProps = {
  activeImport: ImportItem | null;
  actionsDisabled: boolean;
  duplicateHashCounts: ReadonlyMap<string, number>;
  isSuperuser: boolean;
  formatDate: (dateStr: string) => string;
  onAnalysis: (item: ImportItem) => void;
  onClose: () => void;
  onCompare: (item: ImportItem) => void;
  onDelete: (item: ImportItem) => void;
  onView: (item: ImportItem) => void;
};

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function SavedImportDetailDrawer({
  activeImport,
  actionsDisabled,
  duplicateHashCounts,
  formatDate,
  isSuperuser,
  onAnalysis,
  onClose,
  onCompare,
  onDelete,
  onView,
}: SavedImportDetailDrawerProps) {
  const detail = useSavedImportDetailState(activeImport?.id ?? null);
  const resolvedImport = activeImport && detail.summary
    ? { ...activeImport, ...detail.summary.import }
    : activeImport;
  const status = resolvedImport
    ? getSavedImportStatus(resolvedImport, duplicateHashCounts)
    : null;
  const columns = detail.summary?.columns ?? [];

  return (
    <Sheet open={activeImport !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[min(94vw,30rem)] sm:max-w-md"
        data-testid="saved-import-detail-drawer"
      >
        {resolvedImport ? (
          <div className="flex min-h-full flex-col gap-5">
            <SheetHeader className="pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Selected file</Badge>
                {status ? <Badge variant="outline">{status.label}</Badge> : null}
              </div>
              <SheetTitle className="break-words">{resolvedImport.name}</SheetTitle>
              <SheetDescription className="break-words">{resolvedImport.filename}</SheetDescription>
            </SheetHeader>

            {detail.error ? (
              <Alert variant="destructive">
                <AlertDescription>{detail.error}</AlertDescription>
              </Alert>
            ) : null}

            <section className="grid gap-4 rounded-lg border border-border/70 bg-muted/25 p-4 sm:grid-cols-2">
              <DetailRow
                icon={BookOpen}
                label="Rows"
                value={Number(resolvedImport.rowCount || 0).toLocaleString()}
              />
              <DetailRow
                icon={Columns3}
                label="Columns"
                value={detail.loading ? "Loading..." : String(detail.summary?.columnCount ?? "Unknown")}
              />
              <DetailRow
                icon={HardDrive}
                label="Size"
                value={formatSavedFileSize(getSavedImportSizeBytes(resolvedImport))}
              />
              <DetailRow
                icon={UserRound}
                label="Uploaded by"
                value={String(resolvedImport.createdBy || "").trim() || "Unknown"}
              />
              <DetailRow
                icon={CalendarDays}
                label="Uploaded at"
                value={formatDate(resolvedImport.createdAt)}
              />
              <DetailRow
                icon={History}
                label="Last opened"
                value={resolvedImport.lastOpenedAt ? formatDate(resolvedImport.lastOpenedAt) : "Never"}
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Columns3 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Columns</h3>
              </div>
              {detail.loading ? (
                <p className="text-sm text-muted-foreground">Loading column summary...</p>
              ) : columns.length > 0 ? (
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {columns.map((column) => (
                    <Badge key={column} variant="outline" className="max-w-full truncate">
                      {column}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No columns were detected.</p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Source hash</h3>
              </div>
              <code className="block break-all rounded-lg border border-border/70 bg-muted/35 p-3 text-xs text-foreground">
                {resolvedImport.contentHashSha256 || "Not available"}
              </code>
            </section>

            <div className="mt-auto grid gap-2 border-t border-border/70 pt-4 sm:grid-cols-2">
              <Button onClick={() => onView(resolvedImport)}>
                <Eye className="mr-2 h-4 w-4" />
                Open Viewer
              </Button>
              <Button variant="outline" onClick={() => onAnalysis(resolvedImport)}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Analyze
              </Button>
              <Button variant="outline" onClick={() => onCompare(resolvedImport)}>
                <GitCompareArrows className="mr-2 h-4 w-4" />
                Compare
              </Button>
              {isSuperuser ? (
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={actionsDisabled}
                  onClick={() => onDelete(resolvedImport)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
