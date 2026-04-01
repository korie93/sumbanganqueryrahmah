import { Database, Download, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface BackupRestoreHeaderProps {
  activeBackupJobBusy: boolean;
  canManageBackups: boolean;
  embedded: boolean;
  exportingPdf: boolean;
  loading: boolean;
  visibleBackupsLength: number;
  onCreateBackupClick: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onRefresh: () => void;
}

export function BackupRestoreHeader({
  activeBackupJobBusy,
  canManageBackups,
  embedded,
  exportingPdf,
  loading,
  visibleBackupsLength,
  onCreateBackupClick,
  onExportCsv,
  onExportPdf,
  onRefresh,
}: BackupRestoreHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {embedded ? (
        <div>
          <p className="text-sm text-muted-foreground">
            Create data backups, restore previous snapshots, and export the current backup register.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className={`${embedded ? "text-xl" : "text-2xl"} font-bold`} data-testid="text-backup-title">
              Backup & Restore
            </h1>
            <p className="text-sm text-muted-foreground">
              Create data backups and restore from existing backups
            </p>
          </div>
        </div>
      )}

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              disabled={loading || visibleBackupsLength === 0 || exportingPdf}
              data-testid="button-export-backups"
            >
              {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Export
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="end">
            <div className="space-y-1">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={onExportCsv}
                disabled={exportingPdf}
                data-testid="button-export-csv"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={onExportPdf}
                disabled={exportingPdf}
                data-testid="button-export-pdf"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          className="w-full sm:w-auto"
          variant="outline"
          onClick={onRefresh}
          disabled={loading || activeBackupJobBusy}
          data-testid="button-refresh-backups"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        {canManageBackups ? (
          <Button
            className="w-full sm:w-auto"
            onClick={onCreateBackupClick}
            disabled={activeBackupJobBusy}
            data-testid="button-create-backup"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Backup
          </Button>
        ) : null}
      </div>
    </div>
  );
}
