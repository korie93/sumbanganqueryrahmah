import { History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getCollectionDailyCalendarAudit,
  type CollectionDailyCalendarAuditEntry,
  type CollectionDailyOverviewDay,
} from "@/lib/api";
import { formatOperationalDateTime } from "@/lib/date-format";
import { buildCollectionDailyCalendarAuditHistoryItems } from "@/pages/collection/collection-daily-calendar-audit-history-utils";

type CollectionDailyCalendarAuditHistoryDialogProps = {
  day: CollectionDailyOverviewDay;
  username: string;
  year: number;
  month: number;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function formatAuditStatus(status: string | null, leaveType: string | null, note: string | null) {
  if (!status) return "tiada status";
  if (status === "WORKING") return "Working";
  return `${leaveType ?? "Holiday/Leave"}${note ? ` (${note})` : ""}`;
}

function mapApiAuditEntry(entry: CollectionDailyCalendarAuditEntry) {
  const before = formatAuditStatus(entry.oldStatus, entry.oldLeaveType, entry.oldNote);
  const after = formatAuditStatus(entry.newStatus, entry.newLeaveType, entry.newNote);
  const label =
    entry.action === "CREATE"
      ? "Rekod dibuat"
      : entry.action === "DELETE"
        ? "Rekod dipadam"
        : "Status dikemaskini";
  const detail =
    entry.action === "DELETE"
      ? `Status sebelum padam: ${before}.`
      : entry.action === "CREATE"
        ? `Status baru: ${after}.`
        : `Daripada ${before} kepada ${after}.`;

  return {
    id: entry.id,
    label,
    actor: entry.actor || "Sistem",
    occurredAt: entry.createdAt,
    detail,
  };
}

export function CollectionDailyCalendarAuditHistoryDialog({
  day,
  username,
  year,
  month,
}: CollectionDailyCalendarAuditHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [auditEntries, setAuditEntries] = useState<CollectionDailyCalendarAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    setLoading(true);
    setErrorMessage(null);
    setAuditEntries([]);

    void getCollectionDailyCalendarAudit(
      {
        username,
        year,
        month,
        day: day.day,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setAuditEntries(response.audit);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setAuditEntries([]);
          setErrorMessage("Audit penuh belum boleh dimuat. Metadata terakhir masih dipaparkan.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [day.day, month, open, username, year]);

  const items = useMemo(
    () =>
      auditEntries.length
        ? auditEntries.map((entry) => mapApiAuditEntry(entry))
        : buildCollectionDailyCalendarAuditHistoryItems(day),
    [auditEntries, day],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-9 rounded-xl text-xs">
          <History className="mr-2 h-4 w-4" aria-hidden="true" />
          Audit history
        </Button>
      </DialogTrigger>
      <DialogContent className="collection-daily-audit-history-dialog sm:max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>Status audit history</DialogTitle>
          <DialogDescription>
            Rekod audit ringkas untuk tarikh ini berdasarkan metadata calendar tersimpan.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="collection-daily-audit-history-status" role="status" aria-live="polite">
            Memuat audit history...
          </p>
        ) : null}

        {errorMessage ? (
          <p className="collection-daily-audit-history-status" role="status">
            {errorMessage}
          </p>
        ) : null}

        <ol className="collection-daily-audit-history-list" aria-label="Daily status audit history">
          {items.map((item) => (
            <li key={item.id} className="collection-daily-audit-history-item">
              <span className="collection-daily-audit-history-marker" aria-hidden="true" />
              <div>
                <p className="collection-daily-audit-history-title">{item.label}</p>
                <p className="collection-daily-audit-history-meta">
                  {item.actor}
                  {item.occurredAt
                    ? ` - ${formatOperationalDateTime(item.occurredAt, { fallback: item.occurredAt })}`
                    : ""}
                </p>
                <p className="collection-daily-audit-history-detail">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
