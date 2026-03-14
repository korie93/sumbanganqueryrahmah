import { useDeferredValue, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DevMailOutboxPreview } from "@/pages/settings/types";
import { formatDateTime, normalizeSearchValue } from "@/pages/settings/account-management/utils";

interface LocalMailOutboxSectionProps {
  clearingDevMailOutbox: boolean;
  deletingDevMailOutboxId: string | null;
  enabled: boolean;
  entries: DevMailOutboxPreview[];
  loading: boolean;
  onClear: () => void;
  onDeleteEntry: (previewId: string) => void;
  onRefresh: () => void;
}

export function LocalMailOutboxSection({
  clearingDevMailOutbox,
  deletingDevMailOutboxId,
  enabled,
  entries,
  loading,
  onClear,
  onDeleteEntry,
  onRefresh,
}: LocalMailOutboxSectionProps) {
  const [emailQuery, setEmailQuery] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [previewToDelete, setPreviewToDelete] = useState<DevMailOutboxPreview | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const deferredEmailQuery = useDeferredValue(emailQuery);
  const deferredSubjectQuery = useDeferredValue(subjectQuery);

  const filteredEntries = useMemo(() => {
    const normalizedEmail = normalizeSearchValue(deferredEmailQuery);
    const normalizedSubject = normalizeSearchValue(deferredSubjectQuery);

    return [...entries]
      .filter((entry) => {
        const matchesEmail =
          !normalizedEmail || normalizeSearchValue(entry.to).includes(normalizedEmail);
        const matchesSubject =
          !normalizedSubject || normalizeSearchValue(entry.subject).includes(normalizedSubject);
        return matchesEmail && matchesSubject;
      })
      .sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
        const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
        return sortDirection === "asc" ? safeLeft - safeRight : safeRight - safeLeft;
      });
  }, [deferredEmailQuery, deferredSubjectQuery, entries, sortDirection]);

  const emptyMessage = loading
    ? "Loading local mail previews..."
    : entries.length === 0
      ? "No local email previews captured yet."
      : "No email previews match the current filters.";

  return (
    <>
      <Card className="border-border/60 bg-background/60">
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="h-5 w-5" />
              Local Mail Outbox
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Search and manage development activation or reset emails captured locally.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <p className="text-sm font-medium">Sort by date</p>
              <select
                value={sortDirection}
                onChange={(event) =>
                  setSortDirection(event.target.value === "asc" ? "asc" : "desc")
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>
          </div>

          {!enabled && entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
              Local development mail outbox is disabled.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading || filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.to}</TableCell>
                      <TableCell>{entry.subject}</TableCell>
                      <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.open(entry.previewUrl, "_blank", "noopener,noreferrer");
                            }}
                          >
                            Open
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
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
        </CardContent>
      </Card>

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
    </>
  );
}
