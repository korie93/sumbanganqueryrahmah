import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Inbox, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { UrlPreviewDialog } from "@/components/dialogs/UrlPreviewDialog";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DevMailOutboxPreview } from "@/pages/settings/types";
import type { DevMailOutboxPaginationState, DevMailOutboxQueryState } from "@/pages/settings/useSettingsDevMailOutbox";
import { formatDateTime, normalizeSearchValue } from "@/pages/settings/account-management/utils";

interface LocalMailOutboxSectionProps {
  clearingDevMailOutbox: boolean;
  deletingDevMailOutboxId: string | null;
  enabled: boolean;
  entries: DevMailOutboxPreview[];
  loading: boolean;
  pagination: DevMailOutboxPaginationState;
  query: DevMailOutboxQueryState;
  onClear: () => void;
  onDeleteEntry: (previewId: string) => void;
  onQueryChange: (query: Partial<DevMailOutboxQueryState>) => void;
  onRefresh: () => void;
}

export function LocalMailOutboxSection({
  clearingDevMailOutbox,
  deletingDevMailOutboxId,
  enabled,
  entries,
  loading,
  pagination,
  query,
  onClear,
  onDeleteEntry,
  onQueryChange,
  onRefresh,
}: LocalMailOutboxSectionProps) {
  const [emailQuery, setEmailQuery] = useState(query.searchEmail);
  const [subjectQuery, setSubjectQuery] = useState(query.searchSubject);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">(query.sortDirection);
  const [previewToDelete, setPreviewToDelete] = useState<DevMailOutboxPreview | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<DevMailOutboxPreview | null>(null);
  const deferredEmailQuery = useDeferredValue(emailQuery);
  const deferredSubjectQuery = useDeferredValue(subjectQuery);

  const normalizedDeferredEmailQuery = useMemo(
    () => normalizeSearchValue(deferredEmailQuery),
    [deferredEmailQuery],
  );
  const normalizedDeferredSubjectQuery = useMemo(
    () => normalizeSearchValue(deferredSubjectQuery),
    [deferredSubjectQuery],
  );
  const hasSearchFilter = normalizedDeferredEmailQuery.length > 0 || normalizedDeferredSubjectQuery.length > 0;
  const emptyMessage = loading
    ? "Loading local mail previews..."
    : pagination.total === 0 && !hasSearchFilter
      ? "No local email previews captured yet."
      : "No email previews match the current filters.";

  useEffect(() => {
    if (!previewEntry) return;
    if (entries.some((entry) => entry.id === previewEntry.id)) return;
    setPreviewEntry(null);
  }, [entries, previewEntry]);

  useEffect(() => {
    const normalizedEmailFromQuery = normalizeSearchValue(query.searchEmail);
    if (normalizeSearchValue(emailQuery) !== normalizedEmailFromQuery) {
      setEmailQuery(query.searchEmail);
    }
  }, [emailQuery, query.searchEmail]);

  useEffect(() => {
    const normalizedSubjectFromQuery = normalizeSearchValue(query.searchSubject);
    if (normalizeSearchValue(subjectQuery) !== normalizedSubjectFromQuery) {
      setSubjectQuery(query.searchSubject);
    }
  }, [query.searchSubject, subjectQuery]);

  useEffect(() => {
    if (sortDirection !== query.sortDirection) {
      setSortDirection(query.sortDirection);
    }
  }, [query.sortDirection, sortDirection]);

  useEffect(() => {
    if (
      normalizedDeferredEmailQuery === normalizeSearchValue(query.searchEmail)
      && normalizedDeferredSubjectQuery === normalizeSearchValue(query.searchSubject)
    ) {
      return;
    }
    onQueryChange({
      page: 1,
      searchEmail: normalizedDeferredEmailQuery,
      searchSubject: normalizedDeferredSubjectQuery,
    });
  }, [
    normalizedDeferredEmailQuery,
    normalizedDeferredSubjectQuery,
    onQueryChange,
    query.searchEmail,
    query.searchSubject,
  ]);

  return (
    <>
      <SideTabDataPanel
        title="Local Mail Outbox"
        description="Search and manage development activation or reset emails captured locally."
        icon={Inbox}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearAllOpen(true)}
              disabled={clearingDevMailOutbox || loading || entries.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete All
            </Button>
          </>
        }
        filters={
          <div className="grid gap-3 xl:grid-cols-[1fr_1fr_180px]">
            <div className="space-y-2">
              <p className="text-sm font-medium">Search by email</p>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={emailQuery}
                  onChange={(event) => setEmailQuery(event.target.value)}
                  placeholder="Filter recipient email"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Search by subject</p>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={subjectQuery}
                  onChange={(event) => setSubjectQuery(event.target.value)}
                  placeholder="Filter email subject"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label
                id="local-mail-outbox-sort-direction-label"
                htmlFor="local-mail-outbox-sort-direction"
                className="text-sm font-medium"
              >
                Sort by date
              </label>
              <select
                id="local-mail-outbox-sort-direction"
                name="localMailOutboxSortDirection"
                aria-label="Sort by date"
                aria-labelledby="local-mail-outbox-sort-direction-label"
                title="Sort by date"
                value={sortDirection}
                onChange={(event) => {
                  const nextSortDirection = event.target.value === "asc" ? "asc" : "desc";
                  setSortDirection(nextSortDirection);
                  onQueryChange({
                    page: 1,
                    sortDirection: nextSortDirection,
                  });
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
          </div>
        }
        summary={
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
            <span className="font-medium">Total previews: {pagination.total}</span>
            <span className="text-muted-foreground">Current page: {entries.length}</span>
            <span className="text-muted-foreground">Dev outbox: {enabled ? "Enabled" : "Disabled"}</span>
          </div>
        }
        pagination={
          <AppPaginationBar
            disabled={loading}
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.total}
            itemLabel="emails"
            onPageChange={(page) => {
              onQueryChange({ page });
            }}
            onPageSizeChange={(pageSize) => {
              onQueryChange({ page: 1, pageSize });
            }}
          />
        }
      >
        {!enabled && pagination.total === 0 ? (
          <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-sm text-muted-foreground">
            Local development mail outbox is disabled.
          </div>
        ) : (
          <Table className="min-w-[920px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.to}</TableCell>
                    <TableCell>{entry.subject}</TableCell>
                    <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewEntry(entry)}
                        >
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!navigator.clipboard?.writeText) {
                              return;
                            }
                            await navigator.clipboard.writeText(entry.previewUrl);
                          }}
                        >
                          Copy Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewToDelete(entry)}
                          disabled={deletingDevMailOutboxId === entry.id || clearingDevMailOutbox}
                        >
                          {deletingDevMailOutboxId === entry.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </SideTabDataPanel>

      <AlertDialog
        open={previewToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Local Email Preview</AlertDialogTitle>
            <AlertDialogDescription>
              Delete the local mail preview for{" "}
              <span className="font-medium">{previewToDelete?.to || "this recipient"}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingDevMailOutboxId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingDevMailOutboxId) || !previewToDelete}
              onClick={() => {
                if (previewToDelete) {
                  onDeleteEntry(previewToDelete.id);
                }
              }}
            >
              {deletingDevMailOutboxId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Local Email Previews</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every email currently stored in the local development outbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingDevMailOutbox}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearingDevMailOutbox}
              onClick={() => {
                onClear();
              }}
            >
              {clearingDevMailOutbox ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UrlPreviewDialog
        open={previewEntry !== null}
        title="Local Email Preview"
        description={
          previewEntry
            ? `${previewEntry.subject} for ${previewEntry.to}`
            : "Preview the stored development email."
        }
        url={previewEntry?.previewUrl || ""}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewEntry(null);
          }
        }}
        onClose={() => setPreviewEntry(null)}
      />
    </>
  );
}
