import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import {
  createBillingPrincipalReconciliation,
  getBillingPrincipalReconciliationHistory,
  listBillingPrincipalReconciliationCandidates,
  listBillingPrincipalReconciliations,
  prepareBillingPrincipalMutationAttempt,
  updateBillingPrincipalReconciliation,
  voidBillingPrincipalReconciliation,
  type BillingPrincipalAccountCandidate,
  type BillingPrincipalAging,
  type BillingPrincipalManualReason,
  type BillingPrincipalManualReconciliation,
  type BillingPrincipalManualSummaryRow,
  type BillingPrincipalMutationAttempt,
  type BillingPrincipalPagination,
  type BillingPrincipalReconciliationHistoryEntry,
  type BillingPrincipalReconciliationInput,
  type BillingPrincipalSavedTarget,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "@/pages/collection/utils";
import {
  BILLING_PRINCIPAL_AGINGS,
  formatOspCurrency,
  isSafeBillingPrincipalLookup,
  isValidOspMoneyInput,
  subtractOspMoney,
} from "./billing-principal-report-utils";

const PAGE_SIZE = 10;

const REASONS: Array<{ value: BillingPrincipalManualReason; label: string }> = [
  { value: "PRIOR_PAYMENT_NOT_IN_SYSTEM", label: "Prior payment not in system" },
  { value: "CLIENT_CONFIRMED_PRIOR_PAYMENT", label: "Client confirmed prior payment" },
  { value: "HISTORICAL_PAYMENT_MISSING", label: "Historical payment missing" },
  { value: "MIGRATED_HISTORY_GAP", label: "Migrated history gap" },
  { value: "OTHER_WITH_REQUIRED_NOTE", label: "Other (note required)" },
];

type ReconciliationDraft = {
  manualPriorAmount: string;
  asOfDate: string;
  actualPaymentDate: string;
  reason: BillingPrincipalManualReason;
  note: string;
  reference: string;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function emptyPagination(page = 1): BillingPrincipalPagination {
  return { page, pageSize: PAGE_SIZE, total: 0, totalPages: 0 };
}

function defaultPriorAmount(candidate: BillingPrincipalAccountCandidate) {
  const remaining = subtractOspMoney(candidate.totalDue, candidate.systemEligibleCumulative);
  return remaining && isValidOspMoneyInput(remaining) ? remaining : "";
}

function createDraft(asOf: string, candidate?: BillingPrincipalAccountCandidate): ReconciliationDraft {
  return {
    manualPriorAmount: candidate ? defaultPriorAmount(candidate) : "",
    asOfDate: asOf,
    actualPaymentDate: "",
    reason: "PRIOR_PAYMENT_NOT_IN_SYSTEM",
    note: "",
    reference: "",
  };
}

function draftFromRow(row: BillingPrincipalManualReconciliation): ReconciliationDraft {
  return {
    manualPriorAmount: row.manualPriorAmount,
    asOfDate: row.asOfDate,
    actualPaymentDate: row.actualPaymentDate || "",
    reason: row.reason,
    note: row.note || "",
    reference: row.reference || "",
  };
}

function validateDraft(draft: ReconciliationDraft) {
  if (!isValidOspMoneyInput(draft.manualPriorAmount)) {
    return "Manual prior amount must be greater than zero with no more than 2 decimal places.";
  }
  if (!draft.asOfDate) return "As-of date is required.";
  if (draft.actualPaymentDate && draft.actualPaymentDate > draft.asOfDate) {
    return "Actual payment date cannot be later than the as-of date.";
  }
  if (draft.reason === "OTHER_WITH_REQUIRED_NOTE" && !draft.note.trim()) {
    return "A note is required when the reason is Other.";
  }
  return "";
}

function toInput(candidate: Pick<BillingPrincipalAccountCandidate, "sourceImportId" | "sourceRecordId">, draft: ReconciliationDraft): BillingPrincipalReconciliationInput {
  return {
    sourceImportId: candidate.sourceImportId,
    sourceRecordId: candidate.sourceRecordId,
    manualPriorAmount: draft.manualPriorAmount.trim(),
    asOfDate: draft.asOfDate,
    actualPaymentDate: draft.actualPaymentDate || null,
    reason: draft.reason,
    note: draft.note.trim() || null,
    reference: draft.reference.trim() || null,
  };
}

function ReconciliationFields({
  draft,
  setDraft,
  disabled,
  minDate,
  maxDate,
}: {
  draft: ReconciliationDraft;
  setDraft: Dispatch<SetStateAction<ReconciliationDraft>>;
  disabled: boolean;
  minDate?: string | undefined;
  maxDate?: string | undefined;
}) {
  const setField = <K extends keyof ReconciliationDraft>(field: K, value: ReconciliationDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="table-c-manual-amount">Manual prior amount (RM)</Label>
        <Input
          id="table-c-manual-amount"
          inputMode="decimal"
          value={draft.manualPriorAmount}
          onChange={(event) => setField("manualPriorAmount", event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="table-c-as-of">As-of date</Label>
        <Input
          id="table-c-as-of"
          type="date"
          value={draft.asOfDate}
          min={minDate}
          max={maxDate}
          onChange={(event) => setField("asOfDate", event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="table-c-payment-date">Actual payment date (optional)</Label>
        <Input
          id="table-c-payment-date"
          type="date"
          value={draft.actualPaymentDate}
          min={minDate}
          max={draft.asOfDate || undefined}
          onChange={(event) => setField("actualPaymentDate", event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="table-c-reason">Reason</Label>
        <select
          id="table-c-reason"
          className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
          value={draft.reason}
          onChange={(event) => setField("reason", event.target.value as BillingPrincipalManualReason)}
          disabled={disabled}
        >
          {REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="table-c-reference">Evidence reference (optional)</Label>
        <Input
          id="table-c-reference"
          value={draft.reference}
          maxLength={300}
          onChange={(event) => setField("reference", event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="table-c-note">Note {draft.reason === "OTHER_WITH_REQUIRED_NOTE" ? "(required)" : "(optional)"}</Label>
        <Textarea
          id="table-c-note"
          value={draft.note}
          maxLength={2000}
          onChange={(event) => setField("note", event.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function PaginationControls({
  pagination,
  onPageChange,
  disabled,
}: {
  pagination: BillingPrincipalPagination;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const totalPages = Math.max(1, pagination.totalPages);
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>{pagination.total.toLocaleString()} record{pagination.total === 1 ? "" : "s"} · page {pagination.page} of {totalPages}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
          disabled={disabled || pagination.page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={disabled || pagination.totalPages === 0 || pagination.page >= pagination.totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function CreateReconciliationDialog({
  target,
  asOf,
  onSaved,
}: {
  target: BillingPrincipalSavedTarget;
  asOf: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [aging, setAging] = useState<BillingPrincipalAging | "">("");
  const [page, setPage] = useState(1);
  const [candidates, setCandidates] = useState<BillingPrincipalAccountCandidate[]>([]);
  const [pagination, setPagination] = useState(() => emptyPagination());
  const [selected, setSelected] = useState<BillingPrincipalAccountCandidate | null>(null);
  const [draft, setDraft] = useState<ReconciliationDraft>(() => createDraft(asOf));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const attemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listBillingPrincipalReconciliationCandidates(
      target.id,
      target.activeRevision.id,
      { asOf, page, pageSize: PAGE_SIZE, search: search || undefined, aging: aging || undefined },
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setCandidates(response.candidates);
        setPagination(response.pagination);
        setSelected((current) => {
          if (!current) return null;
          const matchingCandidate = response.candidates.find((item) => (
            item.sourceImportId === current.sourceImportId
            && item.sourceRecordId === current.sourceRecordId
          ));
          return matchingCandidate?.activeReconciliationId ? null : matchingCandidate || null;
        });
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) setError(parseApiError(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [aging, asOf, open, page, search, target.activeRevision.id, target.id]);

  useEffect(() => {
    if (!open) return;
    setDraft(createDraft(asOf, selected || undefined));
  }, [asOf, open, selected]);

  const save = async () => {
    if (savingRef.current) return;
    if (!selected) {
      setError("Select an account candidate first.");
      return;
    }
    if (selected.activeReconciliationId) {
      setError("This account already has an active Table C entry.");
      return;
    }
    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const payload = toInput(selected, draft);
    const attempt = prepareBillingPrincipalMutationAttempt(
      "reconciliation:create",
      { targetId: target.id, revisionId: target.activeRevision.id, payload },
      attemptRef.current,
    );
    attemptRef.current = attempt;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await createBillingPrincipalReconciliation(
        target.id,
        target.activeRevision.id,
        payload,
        attempt,
      );
      attemptRef.current = null;
      setOpen(false);
      setSelected(null);
      onSaved();
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add Table C Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create Table C Reconciliation</DialogTitle>
          <DialogDescription>
            Select a masked source account, then record verified prior payment evidence. Calculated values remain server-owned.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[68vh] gap-5 overflow-y-auto pr-1 lg:grid-cols-[1.2fr_1fr]">
          <div className="min-w-0 space-y-3">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                const normalizedSearch = searchDraft.trim();
                if (!isSafeBillingPrincipalLookup(normalizedSearch)) {
                  setError("For privacy, search by card last 4 or customer name; do not enter a full account or card number.");
                  return;
                }
                setPage(1);
                setSearch(normalizedSearch);
              }}
            >
              <Label htmlFor="table-c-candidate-search" className="sr-only">Search candidates</Label>
              <Input
                id="table-c-candidate-search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Card last 4 or customer name"
              />
              <Label htmlFor="table-c-candidate-aging" className="sr-only">Candidate aging</Label>
              <select
                id="table-c-candidate-aging"
                value={aging}
                onChange={(event) => { setAging(event.target.value as BillingPrincipalAging | ""); setPage(1); }}
                className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All aging</option>
                {BILLING_PRINCIPAL_AGINGS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <Button type="submit" variant="outline" disabled={loading}>
                <Search className="mr-2 h-4 w-4" aria-hidden="true" /> Search
              </Button>
            </form>

            <div className="overflow-hidden rounded-xl border border-border/70">
              {loading ? (
                <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading candidates...
                </p>
              ) : candidates.length === 0 ? (
                <p className="flex min-h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">No eligible candidates match these filters.</p>
              ) : (
                <div className="divide-y divide-border/60">
                  {candidates.map((candidate) => {
                    const selectedRow = selected?.sourceImportId === candidate.sourceImportId
                      && selected.sourceRecordId === candidate.sourceRecordId;
                    const alreadyReconciled = Boolean(candidate.activeReconciliationId);
                    return (
                      <button
                        key={`${candidate.sourceImportId}:${candidate.sourceRecordId}`}
                        type="button"
                        className={`w-full p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${selectedRow ? "bg-primary/10" : ""}`}
                        onClick={() => setSelected(candidate)}
                        disabled={alreadyReconciled}
                        {...getAriaPressedProps(selectedRow)}
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{candidate.maskedAccountNumber}</span>
                          <span className="flex items-center gap-2">
                            {alreadyReconciled ? <Badge variant="secondary">Already in Table C</Badge> : null}
                            <Badge variant="outline">{candidate.aging}</Badge>
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">{candidate.maskedCustomerName} · card {candidate.cardNumberLast4 || "—"}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Due {formatOspCurrency(candidate.totalDue)} · system cumulative {formatOspCurrency(candidate.systemEligibleCumulative)}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground" title={`${candidate.sourceName} · ${candidate.sourceFilename}`}>
                          {candidate.sourceName} · {candidate.sourceFilename} · calling {candidate.callingDate}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <PaginationControls pagination={pagination} onPageChange={setPage} disabled={loading} />
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            {selected ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
                <p className="font-medium">{selected.maskedAccountNumber} · {selected.aging}</p>
                <p className="mt-1 text-muted-foreground">Billing Principal {formatOspCurrency(selected.billingPrincipalOsp)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground" title={`${selected.sourceName} · ${selected.sourceFilename}`}>
                  {selected.sourceName} · {selected.sourceFilename} · calling {selected.callingDate}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">Select a candidate to enable the entry form.</div>
            )}
            <ReconciliationFields
              draft={draft}
              setDraft={setDraft}
              disabled={saving || !selected}
              minDate={selected?.callingDate}
              maxDate={asOf}
            />
          </div>
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !selected}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Creating..." : "Create Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditReconciliationDialog({
  target,
  asOf,
  row,
  onClose,
  onSaved,
}: {
  target: BillingPrincipalSavedTarget;
  asOf: string;
  row: BillingPrincipalManualReconciliation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ReconciliationDraft>(() => row ? draftFromRow(row) : createDraft(""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const attemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  useEffect(() => {
    if (row) {
      setDraft(draftFromRow(row));
      setError("");
    }
  }, [row]);

  const save = async () => {
    if (!row || savingRef.current) return;
    const validationError = validateDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const payload = { ...toInput(row, draft), version: row.version };
    const attempt = prepareBillingPrincipalMutationAttempt(
      "reconciliation:update",
      {
        targetId: target.id,
        revisionId: target.activeRevision.id,
        reconciliationId: row.id,
        payload,
      },
      attemptRef.current,
    );
    attemptRef.current = attempt;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await updateBillingPrincipalReconciliation(
        target.id,
        target.activeRevision.id,
        row.id,
        payload,
        attempt,
      );
      attemptRef.current = null;
      onClose();
      onSaved();
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Table C Entry</DialogTitle>
          <DialogDescription>{row ? `${row.maskedAccountNumber} · version ${row.version}` : "Update reconciliation evidence."}</DialogDescription>
        </DialogHeader>
        <ReconciliationFields
          draft={draft}
          setDraft={setDraft}
          disabled={saving}
          minDate={row?.callingDate}
          maxDate={asOf}
        />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !row}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidReconciliationDialog({
  target,
  asOf,
  row,
  onClose,
  onSaved,
}: {
  target: BillingPrincipalSavedTarget;
  asOf: string;
  row: BillingPrincipalManualReconciliation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const attemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  useEffect(() => {
    if (row) {
      setReason("");
      setError("");
    }
  }, [row]);

  const save = async () => {
    if (!row || savingRef.current) return;
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError("Void reason is required.");
      return;
    }
    const payload = { version: row.version, reason: normalizedReason, asOfDate: asOf };
    const attempt = prepareBillingPrincipalMutationAttempt(
      "reconciliation:void",
      {
        targetId: target.id,
        revisionId: target.activeRevision.id,
        reconciliationId: row.id,
        payload,
      },
      attemptRef.current,
    );
    attemptRef.current = attempt;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await voidBillingPrincipalReconciliation(
        target.id,
        target.activeRevision.id,
        row.id,
        payload,
        attempt,
      );
      attemptRef.current = null;
      onClose();
      onSaved();
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Void Table C Entry</DialogTitle>
          <DialogDescription>
            This removes the entry from active reconciliation while retaining the full audit history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="table-c-void-reason">Reason</Label>
          <Textarea
            id="table-c-void-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            disabled={saving}
          />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => void save()} disabled={saving || !row}>
            {saving ? "Voiding..." : "Void Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  target,
  row,
  onClose,
}: {
  target: BillingPrincipalSavedTarget;
  row: BillingPrincipalManualReconciliation | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<BillingPrincipalReconciliationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const auditValue = (state: Record<string, unknown> | null, field: string) => {
    const value = state?.[field];
    return typeof value === "string" || typeof value === "number" ? String(value) : "—";
  };

  useEffect(() => {
    if (!row) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setHistory([]);
    getBillingPrincipalReconciliationHistory(
      target.id,
      target.activeRevision.id,
      row.id,
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) setHistory(response.history);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) setError(parseApiError(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [row, target.activeRevision.id, target.id]);

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Table C Audit History</DialogTitle>
          <DialogDescription>{row?.maskedAccountNumber || "Reconciliation entry"}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading history...</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error && history.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No audit events found.</p> : null}
          {history.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline">{entry.operation}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm">Version {entry.fromVersion ?? "—"} → {entry.toVersion}</p>
              <p className="mt-1 text-xs text-muted-foreground">By {entry.actor}</p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-lg bg-muted/30 p-2">
                  <dt className="font-medium text-muted-foreground">Manual prior</dt>
                  <dd className="mt-0.5 break-words">
                    {auditValue(entry.before, "manualPriorAmount")} → {auditValue(entry.after, "manualPriorAmount")}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <dt className="font-medium text-muted-foreground">Status</dt>
                  <dd className="mt-0.5 break-words">
                    {auditValue(entry.before, "status")} → {auditValue(entry.after, "status")}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <dt className="font-medium text-muted-foreground">As-of date</dt>
                  <dd className="mt-0.5 break-words">
                    {auditValue(entry.before, "asOfDate")} → {auditValue(entry.after, "asOfDate")}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <dt className="font-medium text-muted-foreground">Reason / void reason</dt>
                  <dd className="mt-0.5 break-words">
                    {auditValue(entry.after, "voidReason") === "—"
                      ? auditValue(entry.after, "reason")
                      : auditValue(entry.after, "voidReason")}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewReconciliationDialog({
  row,
  onClose,
}: {
  row: BillingPrincipalManualReconciliation | null;
  onClose: () => void;
}) {
  if (!row) return null;
  const details = [
    ["Account", row.maskedAccountNumber],
    ["Customer", row.maskedCustomerName],
    ["Card", row.cardNumberLast4 ? `ending ${row.cardNumberLast4}` : "—"],
    ["Saved source", row.sourceName],
    ["Source filename", row.sourceFilename],
    ["Aging", row.aging],
    ["Calling date", row.callingDate],
    ["TOTAL DUE", formatOspCurrency(row.totalDue)],
    ["Billing Principal (OSP)", formatOspCurrency(row.billingPrincipalOsp)],
    ["System cumulative", formatOspCurrency(row.systemEligibleCumulative)],
    ["Manual prior payment", formatOspCurrency(row.manualPriorAmount)],
    ["Reconciled cumulative", formatOspCurrency(row.reconciledCumulative)],
    ["Remaining", formatOspCurrency(row.reconciledRemaining)],
    ["As-of date", row.asOfDate],
    ["Actual payment date", row.actualPaymentDate || "—"],
    ["Effective closed date", row.reconciledClosedEffectiveDate || "—"],
    ["Result", row.reconciledStatus.replace(/_/g, " ")],
    ["Reason", row.reason.replace(/_/g, " ")],
    ["Reference", row.reference || "—"],
    ["Note", row.note || "—"],
    ["Status / version", `${row.status} / ${row.version}`],
    ["Last updated", `${row.updatedAt} by ${row.updatedBy}`],
  ] as const;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Table C Reconciliation Details</DialogTitle>
          <DialogDescription>
            Trusted master values and the derived reconciliation remain read-only in this view.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid max-h-[62vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl border border-border/70 bg-muted/20 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReconciliationActions({
  row,
  role,
  onView,
  onHistory,
  onEdit,
  onVoid,
}: {
  row: BillingPrincipalManualReconciliation;
  role: string;
  onView: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onVoid: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1" aria-label={`Actions for ${row.maskedAccountNumber}`}>
      <Button type="button" size="icon" variant="ghost" onClick={onView} aria-label={`View ${row.maskedAccountNumber}`}>
        <Eye className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onHistory} aria-label={`View history for ${row.maskedAccountNumber}`}>
        <History className="h-4 w-4" aria-hidden="true" />
      </Button>
      {role === "superuser" && row.status === "ACTIVE" ? (
        <>
          <Button type="button" size="icon" variant="ghost" onClick={onEdit} aria-label={`Edit ${row.maskedAccountNumber}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={onVoid} aria-label={`Void ${row.maskedAccountNumber}`}>
            <Ban className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function BillingPrincipalTableC({
  target,
  asOf,
  summary,
  role,
  onChanged,
}: {
  target: BillingPrincipalSavedTarget;
  asOf: string;
  summary: {
    rows: BillingPrincipalManualSummaryRow[];
    all: Omit<BillingPrincipalManualSummaryRow, "aging"> & { aging: "ALL" };
  };
  role: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<BillingPrincipalManualReconciliation[]>([]);
  const [pagination, setPagination] = useState(() => emptyPagination());
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [aging, setAging] = useState<BillingPrincipalAging | "">("");
  const [status, setStatus] = useState<"ACTIVE" | "VOIDED" | "">("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [editing, setEditing] = useState<BillingPrincipalManualReconciliation | null>(null);
  const [voiding, setVoiding] = useState<BillingPrincipalManualReconciliation | null>(null);
  const [historyRow, setHistoryRow] = useState<BillingPrincipalManualReconciliation | null>(null);
  const [viewing, setViewing] = useState<BillingPrincipalManualReconciliation | null>(null);
  const targetScope = `${target.id}:${target.activeRevision.id}`;
  const dataScope = `${targetScope}:${asOf}`;
  const [loadedDataScope, setLoadedDataScope] = useState("");

  useEffect(() => {
    setRows([]);
    setPagination(emptyPagination());
    setPage(1);
    setSearchDraft("");
    setSearch("");
    setAging("");
    setStatus("ACTIVE");
    setError("");
    setRefreshVersion(0);
    setEditing(null);
    setVoiding(null);
    setHistoryRow(null);
    setViewing(null);
    setLoadedDataScope("");
  }, [targetScope]);

  useEffect(() => {
    setEditing(null);
    setVoiding(null);
    setHistoryRow(null);
    setViewing(null);
    setLoadedDataScope("");
  }, [dataScope]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listBillingPrincipalReconciliations(
      target.id,
      target.activeRevision.id,
      {
        asOf,
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        aging: aging || undefined,
        status: status || undefined,
      },
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setRows(response.reconciliations);
        setPagination(response.pagination);
        setLoadedDataScope(dataScope);
        if (response.pagination.totalPages > 0 && page > response.pagination.totalPages) {
          setPage(response.pagination.totalPages);
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) {
          setRows([]);
          setPagination(emptyPagination(page));
          setLoadedDataScope(dataScope);
          setError(parseApiError(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [aging, asOf, dataScope, page, refreshVersion, search, status, target.activeRevision.id, target.id]);

  const changed = () => {
    setRefreshVersion((value) => value + 1);
    onChanged();
  };
  const visibleRows = loadedDataScope === dataScope ? rows : [];
  const visiblePagination = loadedDataScope === dataScope ? pagination : emptyPagination(1);

  return (
    <section aria-labelledby="billing-table-c" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">C</span>
          <div>
            <h3 id="billing-table-c" className="font-semibold">Table C · Manual Prior Payment / OSP Reconciliation</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Audited account-level prior-payment evidence; trusted OSP and closure remain server-derived.</p>
          </div>
        </div>
        {role === "superuser" ? <CreateReconciliationDialog key={dataScope} target={target} asOf={asOf} onSaved={changed} /> : null}
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Eligible Table C OSP</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatOspCurrency(summary.all.ospClosed)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Closed accounts</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{summary.all.closedAccountCount.toLocaleString()}</p>
        </div>
      </div>

      <form
        className="grid gap-2 border-y border-border/60 bg-muted/10 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const normalizedSearch = searchDraft.trim();
          if (!isSafeBillingPrincipalLookup(normalizedSearch)) {
            setError("For privacy, search by card last 4; do not enter a full account or card number.");
            return;
          }
          setPage(1);
          setSearch(normalizedSearch);
        }}
      >
        <div>
          <Label htmlFor="table-c-list-search" className="sr-only">Search Table C</Label>
          <Input
            id="table-c-list-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search by card last 4"
          />
        </div>
        <select
          aria-label="Filter Table C by aging"
          value={aging}
          onChange={(event) => { setAging(event.target.value as BillingPrincipalAging | ""); setPage(1); }}
          className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All aging</option>
          {BILLING_PRINCIPAL_AGINGS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select
          aria-label="Filter Table C by status"
          value={status}
          onChange={(event) => { setStatus(event.target.value as "ACTIVE" | "VOIDED" | ""); setPage(1); }}
          className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="VOIDED">Voided</option>
        </select>
        <Button type="submit" variant="outline" disabled={loading}>
          <Search className="mr-2 h-4 w-4" aria-hidden="true" /> Search
        </Button>
      </form>

      {error ? <p role="alert" className="m-4 text-sm text-destructive">{error}</p> : null}
      <div className="space-y-3 p-4 md:hidden" aria-busy={loading}>
        {loading && visibleRows.length === 0 ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading Table C...</p>
        ) : visibleRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No Table C entries match these filters.</p>
        ) : visibleRows.map((row) => (
          <article key={row.id} className="rounded-xl border border-border/70 bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{row.maskedAccountNumber}</p>
                <p className="truncate text-xs text-muted-foreground">{row.maskedCustomerName}</p>
                <p className="text-xs text-muted-foreground">Card {row.cardNumberLast4 ? `ending ${row.cardNumberLast4}` : "—"}</p>
                <div className="mt-1 min-w-0 text-xs text-muted-foreground">
                  <p className="truncate" title={row.sourceName}>{row.sourceName}</p>
                  <p className="truncate" title={row.sourceFilename}>{row.sourceFilename}</p>
                </div>
              </div>
              <Badge variant="outline">{row.aging}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted/25 p-2">
                <dt className="text-xs text-muted-foreground">System cumulative</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{formatOspCurrency(row.systemEligibleCumulative)}</dd>
              </div>
              <div className="rounded-lg bg-muted/25 p-2">
                <dt className="text-xs text-muted-foreground">Manual prior</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{formatOspCurrency(row.manualPriorAmount)}</dd>
              </div>
              <div className="rounded-lg bg-muted/25 p-2">
                <dt className="text-xs text-muted-foreground">Reconciled</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{formatOspCurrency(row.reconciledCumulative)}</dd>
              </div>
              <div className="rounded-lg bg-muted/25 p-2">
                <dt className="text-xs text-muted-foreground">Billing Principal</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{formatOspCurrency(row.billingPrincipalOsp)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-border/60 pt-3">
              <div>
                <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>{row.status}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">{row.reconciledStatus.replace(/_/g, " ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Effective {row.reconciledClosedEffectiveDate || "—"}</p>
              </div>
              <ReconciliationActions
                row={row}
                role={role}
                onView={() => setViewing(row)}
                onHistory={() => setHistoryRow(row)}
                onEdit={() => setEditing(row)}
                onVoid={() => setVoiding(row)}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block" aria-busy={loading}>
        <Table aria-label="Table C manual reconciliation entries" className="min-w-[1050px]">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="bg-muted/30">
              <TableHead>Account / customer</TableHead>
              <TableHead>Aging</TableHead>
              <TableHead className="text-right">System cumulative</TableHead>
              <TableHead className="text-right">Manual prior</TableHead>
              <TableHead className="text-right">Reconciled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Effective date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && visibleRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Loading Table C...</TableCell></TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No Table C entries match these filters.</TableCell></TableRow>
            ) : visibleRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.maskedAccountNumber}</p>
                  <p className="max-w-52 truncate text-xs text-muted-foreground">{row.maskedCustomerName}</p>
                  <p className="max-w-52 truncate text-xs text-muted-foreground" title={row.sourceName}>{row.sourceName}</p>
                  <p className="max-w-52 truncate text-xs text-muted-foreground" title={row.sourceFilename}>{row.sourceFilename}</p>
                </TableCell>
                <TableCell><Badge variant="outline">{row.aging}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(row.systemEligibleCumulative)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(row.manualPriorAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(row.reconciledCumulative)}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>{row.status}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">{row.reconciledStatus.replace(/_/g, " ")}</p>
                </TableCell>
                <TableCell>{row.reconciledClosedEffectiveDate || "—"}</TableCell>
                <TableCell>
                  <ReconciliationActions
                    row={row}
                    role={role}
                    onView={() => setViewing(row)}
                    onHistory={() => setHistoryRow(row)}
                    onEdit={() => setEditing(row)}
                    onVoid={() => setVoiding(row)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationControls pagination={visiblePagination} onPageChange={setPage} disabled={loading} />

      <EditReconciliationDialog target={target} asOf={asOf} row={loadedDataScope === dataScope ? editing : null} onClose={() => setEditing(null)} onSaved={changed} />
      <VoidReconciliationDialog target={target} asOf={asOf} row={loadedDataScope === dataScope ? voiding : null} onClose={() => setVoiding(null)} onSaved={changed} />
      <HistoryDialog target={target} row={loadedDataScope === dataScope ? historyRow : null} onClose={() => setHistoryRow(null)} />
      <ViewReconciliationDialog row={loadedDataScope === dataScope ? viewing : null} onClose={() => setViewing(null)} />
    </section>
  );
}
