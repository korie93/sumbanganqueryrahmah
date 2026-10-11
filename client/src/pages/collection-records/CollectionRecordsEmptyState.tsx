import { Button } from "@/components/ui/button";

export type CollectionRecordsEmptyStateProps = {
  hasSearch?: boolean | undefined;
  hasFilters?: boolean | undefined;
  recordsLoadFailed?: boolean | undefined;
  onClearSearch?: (() => void) | undefined;
  onResetFilters?: (() => void) | undefined;
  onReloadRecords?: (() => void) | undefined;
};

export function CollectionRecordsEmptyState({
  hasSearch = false,
  hasFilters = false,
  recordsLoadFailed = false,
  onClearSearch,
  onResetFilters,
  onReloadRecords,
}: CollectionRecordsEmptyStateProps) {
  const filtered = hasSearch || hasFilters;
  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-card px-4 py-6 text-center"
      aria-label="Status rekod collection"
      data-testid="collection-records-empty-state"
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">
          {recordsLoadFailed ? "Rekod tidak dapat dimuatkan" : filtered
            ? "Tiada rekod sepadan" : "Tiada rekod untuk dipaparkan"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {recordsLoadFailed ? "Cuba muat semula rekod. Carian dan penapis anda dikekalkan." : filtered
            ? "Cuba kosongkan carian atau luaskan penapis. Tindakan ini tidak memadam rekod."
            : "Tiada rekod collection tersedia dalam skop akses anda buat masa ini."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {recordsLoadFailed ? onReloadRecords && (
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-11" onClick={onReloadRecords}>
            Cuba semula
          </Button>
        ) : <>
          {hasSearch && onClearSearch ? (
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-11" onClick={onClearSearch}>
              Kosongkan carian
            </Button>
          ) : null}
          {hasFilters && onResetFilters ? (
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-11" onClick={onResetFilters}>
              Reset penapis
            </Button>
          ) : null}
        </>}
      </div>
    </section>
  );
}
