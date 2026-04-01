import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackupListEmptyStateProps {
  onClearFilters: () => void;
  totalBackups: number;
}

export function BackupListEmptyState({
  onClearFilters,
  totalBackups,
}: BackupListEmptyStateProps) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
      {totalBackups === 0 ? (
        <>
          <p>No backups found.</p>
          <p className="text-sm mt-2">Click "Create Backup" to create a new backup.</p>
        </>
      ) : (
        <>
          <p>No backups match the filters.</p>
          <Button
            variant="ghost"
            onClick={onClearFilters}
            className="mt-2"
            data-testid="button-clear-backup-filters-empty"
          >
            Clear all filters
          </Button>
        </>
      )}
    </div>
  );
}
