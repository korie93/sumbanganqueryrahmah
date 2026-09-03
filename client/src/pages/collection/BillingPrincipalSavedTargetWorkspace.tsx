import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CalendarDays, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  getBillingPrincipalSavedTargetOverview,
  prepareBillingPrincipalMutationAttempt,
  upsertBillingPrincipalClientResults,
  type BillingPrincipalAging,
  type BillingPrincipalClientResultInput,
  type BillingPrincipalClientRow,
  type BillingPrincipalMutationAttempt,
  type BillingPrincipalReportRow,
  type BillingPrincipalReconciledRow,
  type BillingPrincipalSavedTarget,
  type BillingPrincipalSavedTargetOverview,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "@/pages/collection/utils";
import {
  BILLING_PRINCIPAL_AGINGS,
  formatOspCurrency,
  formatOspPercentage,
  getClientResultConsistencyWarning,
  isValidOspMoneyInput,
  isValidOspPercentageInput,
} from "./billing-principal-report-utils";
import { BillingPrincipalInsights } from "./BillingPrincipalInsights";
import { BillingPrincipalTableC } from "./BillingPrincipalTableC";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function todayIsoDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getTrackingRange(target: BillingPrincipalSavedTarget) {
  const start = target.activeRevision.trackingStartDate || target.activeRevision.from;
  const end = target.activeRevision.trackingEndDate || target.activeRevision.to;
  return { start, end };
}

function initialAsOf(target: BillingPrincipalSavedTarget) {
  const range = getTrackingRange(target);
  const today = todayIsoDate();
  if (today < range.start) return range.start;
  if (today > range.end) return range.end;
  return today;
}

function SectionHeading({
  number,
  title,
  description,
  action,
}: {
  number: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {number}
        </span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

type BillingPrincipalDrilldownRequest = {
  sequence: number;
  date: string;
  aging: BillingPrincipalAging | "";
  source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "";
};

function DrilldownAmountButton({
  value,
  label,
  onClick,
}: {
  value: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="font-semibold tabular-nums text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      aria-label={label}
    >
      {formatOspCurrency(value)}
    </button>
  );
}

function SystemResultSection({
  overview,
  onDrilldown,
}: {
  overview: BillingPrincipalSavedTargetOverview;
  onDrilldown: (aging: BillingPrincipalAging | "ALL", source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "") => void;
}) {
  const result = overview.systemResult;
  return (
    <section aria-labelledby="billing-system-result" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div id="billing-system-result">
        <SectionHeading
          number="A"
          title="Table A · System Result"
          description="Server-calculated Abort CP result from the frozen target revision."
        />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="TT OSP" value={formatOspCurrency(result.all.totalOsp)} />
        <Metric label="Target OSP" value={formatOspCurrency(result.all.targetOsp)} />
        <div className="min-w-0 rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OSP closed</p>
          <p className="mt-1 text-lg">
            <DrilldownAmountButton
              value={result.all.ospClosed}
              label="Open System OSP closed drilldown for all aging"
              onClick={() => onDrilldown("ALL", "SYSTEM_ABORT_CP")}
            />
          </p>
        </div>
        <Metric label="Result" value={formatOspPercentage(result.all.resultPercentage)} />
      </div>
      <SystemResultTable rows={result.rows} all={result.all} onDrilldown={onDrilldown} />
    </section>
  );
}

function Metric({ label, value, supporting }: { label: string; value: string; supporting?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums">{value}</p>
      {supporting ? <p className="mt-1 text-xs text-muted-foreground">{supporting}</p> : null}
    </div>
  );
}

function SystemResultTable({
  rows,
  all,
  onDrilldown,
}: {
  rows: BillingPrincipalReportRow[];
  all: Omit<BillingPrincipalReportRow, "aging"> & { aging: "ALL" };
  onDrilldown: (aging: BillingPrincipalAging | "ALL", source: "SYSTEM_ABORT_CP") => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-border/60">
      <Table aria-label="System Billing Principal result" className="min-w-[780px]">
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Aging</TableHead>
            <TableHead className="text-right">TT OSP</TableHead>
            <TableHead className="text-right">Target %</TableHead>
            <TableHead className="text-right">Target OSP</TableHead>
            <TableHead className="text-right">OSP closed</TableHead>
            <TableHead className="text-right">Result %</TableHead>
            <TableHead className="text-right">Accounts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.aging}>
              <TableCell className="font-semibold">{row.aging}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.totalOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(row.targetPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.targetOsp)}</TableCell>
              <TableCell className="text-right">
                <DrilldownAmountButton
                  value={row.ospClosed}
                  label={`Open System OSP closed drilldown for ${row.aging}`}
                  onClick={() => onDrilldown(row.aging, "SYSTEM_ABORT_CP")}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(row.resultPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.closedAccountCount.toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>ALL</TableCell>
            <TableCell className="text-right tabular-nums">{formatOspCurrency(all.totalOsp)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatOspPercentage(all.targetPercentage)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatOspCurrency(all.targetOsp)}</TableCell>
            <TableCell className="text-right">
              <DrilldownAmountButton
                value={all.ospClosed}
                label="Open System OSP closed drilldown for all aging"
                onClick={() => onDrilldown("ALL", "SYSTEM_ABORT_CP")}
              />
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatOspPercentage(all.resultPercentage)}</TableCell>
            <TableCell className="text-right tabular-nums">{all.closedAccountCount.toLocaleString()}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

type ClientDraftRow = {
  resultPercentage: string;
  ospClosed: string;
  note: string;
  reference: string;
};

type ClientDraft = Record<BillingPrincipalAging, ClientDraftRow>;

export function getBillingPrincipalExactClientSnapshotWarning(input: {
  asOf: string;
  agingScope: readonly BillingPrincipalAging[];
  rows: readonly BillingPrincipalClientRow[];
}) {
  const missing = input.agingScope.filter((aging) => (
    input.rows.find((row) => row.aging === aging)?.effectiveDate !== input.asOf
  ));
  if (missing.length === 0) return null;
  return `No exact client snapshot is saved for ${missing.join(", ")} on ${input.asOf}. Client figures are not carried forward from another date.`;
}

function createClientDraft(rows: BillingPrincipalClientRow[]): ClientDraft {
  return Object.fromEntries(BILLING_PRINCIPAL_AGINGS.map((aging) => {
    const row = rows.find((candidate) => candidate.aging === aging);
    return [aging, {
      resultPercentage: row?.resultPercentage || "0",
      ospClosed: row?.ospClosed || "0",
      note: row?.note || "",
      reference: row?.reference || "",
    }];
  })) as ClientDraft;
}

function validateClientDraft(draft: ClientDraft, agingScope: BillingPrincipalAging[]) {
  for (const aging of agingScope) {
    const row = draft[aging];
    if (!isValidOspPercentageInput(row.resultPercentage)) {
      return `${aging} Result % must be between 0 and 100 with no more than 4 decimal places.`;
    }
    if (!isValidOspMoneyInput(row.ospClosed, { allowZero: true })) {
      return `${aging} OSP closed must be zero or a positive amount with no more than 2 decimal places.`;
    }
  }
  return "";
}

function ClientResultsDialog({
  target,
  asOf,
  rows,
  baselines,
  onSaved,
}: {
  target: BillingPrincipalSavedTarget;
  asOf: string;
  rows: BillingPrincipalClientRow[];
  baselines: BillingPrincipalReportRow[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ClientDraft>(() => createClientDraft(rows));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const attemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  useEffect(() => {
    if (open) {
      setDraft(createClientDraft(rows));
      setError("");
    }
  }, [open, rows]);

  const update = (aging: BillingPrincipalAging, field: keyof ClientDraftRow, value: string) => {
    setDraft((current) => ({
      ...current,
      [aging]: { ...current[aging], [field]: value },
    }));
  };

  const save = async () => {
    if (savingRef.current) return;
    const validationError = validateClientDraft(draft, target.activeRevision.agingScope);
    if (validationError) {
      setError(validationError);
      return;
    }
    const inputRows: BillingPrincipalClientResultInput[] = target.activeRevision.agingScope.map((aging) => {
      const persisted = rows.find((row) => row.aging === aging && row.effectiveDate === asOf);
      return {
        aging,
        resultPercentage: draft[aging].resultPercentage.trim(),
        ospClosed: draft[aging].ospClosed.trim(),
        note: draft[aging].note.trim() || null,
        reference: draft[aging].reference.trim() || null,
        ...(persisted?.version == null ? {} : { version: persisted.version }),
      };
    });
    const payload = { asOf, rows: inputRows };
    const attempt = prepareBillingPrincipalMutationAttempt(
      "client-results:upsert",
      { targetId: target.id, revisionId: target.activeRevision.id, payload },
      attemptRef.current,
    );
    attemptRef.current = attempt;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await upsertBillingPrincipalClientResults(
        target.id,
        target.activeRevision.id,
        payload,
        attempt,
      );
      attemptRef.current = null;
      setOpen(false);
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
        <Button type="button" size="sm" variant="outline">Enter Client Results</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Client Result · {asOf}</DialogTitle>
          <DialogDescription>
            Record the client-reported result for each aging bucket. The server retains versions for comparison.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {target.activeRevision.agingScope.map((aging) => {
            const baseline = baselines.find((row) => row.aging === aging)?.totalOsp;
            const consistencyWarning = getClientResultConsistencyWarning({
              totalOsp: baseline,
              clientOspClosed: draft[aging].ospClosed,
              clientResultPercentage: draft[aging].resultPercentage,
            });
            return (
            <fieldset key={aging} className="space-y-3 rounded-xl border border-border/70 p-4">
              <legend className="px-1 font-semibold">
                {aging}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`client-result-${aging}`}>Result %</Label>
                  <Input
                    id={`client-result-${aging}`}
                    inputMode="decimal"
                    value={draft[aging].resultPercentage}
                    onChange={(event) => update(aging, "resultPercentage", event.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`client-osp-${aging}`}>OSP closed (RM)</Label>
                  <Input
                    id={`client-osp-${aging}`}
                    inputMode="decimal"
                    value={draft[aging].ospClosed}
                    onChange={(event) => update(aging, "ospClosed", event.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`client-reference-${aging}`}>Reference (optional)</Label>
                <Input
                  id={`client-reference-${aging}`}
                  value={draft[aging].reference}
                  maxLength={300}
                  onChange={(event) => update(aging, "reference", event.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`client-note-${aging}`}>Note (optional)</Label>
                <Textarea
                  id={`client-note-${aging}`}
                  value={draft[aging].note}
                  maxLength={2000}
                  onChange={(event) => update(aging, "note", event.target.value)}
                  disabled={saving}
                />
              </div>
              {consistencyWarning ? (
                <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
                  Audit warning: {consistencyWarning} You may still save the independently supplied client figures.
                </p>
              ) : null}
            </fieldset>
            );
          })}
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Saving..." : "Save Client Results"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientResultSection({
  target,
  overview,
  role,
  onSaved,
}: {
  target: BillingPrincipalSavedTarget;
  overview: BillingPrincipalSavedTargetOverview;
  role: string;
  onSaved: () => void;
}) {
  const result = overview.clientResult;
  const baselineByAging = new Map(overview.systemResult.rows.map((row) => [row.aging, row.totalOsp]));
  const exactSnapshotWarning = getBillingPrincipalExactClientSnapshotWarning({
    asOf: overview.asOf,
    agingScope: target.activeRevision.agingScope,
    rows: result.rows,
  });
  const hasExactClientSnapshot = exactSnapshotWarning === null;

  const warningFor = (row: BillingPrincipalClientRow) => row.effectiveDate
    ? getClientResultConsistencyWarning({
        totalOsp: baselineByAging.get(row.aging),
        clientOspClosed: row.ospClosed,
        clientResultPercentage: row.resultPercentage,
      })
    : null;
  const allWarning = hasExactClientSnapshot
    ? getClientResultConsistencyWarning({
        totalOsp: overview.systemResult.all.totalOsp,
        clientOspClosed: result.all.ospClosed,
        clientResultPercentage: result.all.resultPercentage,
      })
    : null;
  return (
    <section aria-labelledby="billing-client-result" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div id="billing-client-result">
        <SectionHeading
          number="B"
          title="Table B · Client Result"
          description={`Client-submitted benchmark effective on ${overview.asOf}.`}
          action={role === "superuser" ? (
            <ClientResultsDialog
              target={target}
              asOf={overview.asOf}
              rows={result.rows}
              baselines={overview.systemResult.rows}
              onSaved={onSaved}
            />
          ) : undefined}
        />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Metric label="Client OSP closed" value={hasExactClientSnapshot ? formatOspCurrency(result.all.ospClosed) : "-"} />
        <Metric label="Client result" value={hasExactClientSnapshot ? formatOspPercentage(result.all.resultPercentage) : "-"} supporting={hasExactClientSnapshot ? overview.asOf : "No complete exact snapshot"} />
      </div>
      {exactSnapshotWarning ? (
        <p role="status" className="mx-4 mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          Audit warning: {exactSnapshotWarning}
        </p>
      ) : null}
      <div className="overflow-x-auto border-t border-border/60">
        <Table aria-label="Client Billing Principal result" className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Aging</TableHead>
              <TableHead className="text-right">OSP closed</TableHead>
              <TableHead className="text-right">Result %</TableHead>
              <TableHead>Effective date</TableHead>
              <TableHead>Reference / note</TableHead>
              <TableHead>Audit check</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row) => (
              <TableRow key={row.aging}>
                <TableCell className="font-semibold">{row.aging}</TableCell>
                <TableCell className="text-right tabular-nums">{row.effectiveDate ? formatOspCurrency(row.ospClosed) : "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{row.effectiveDate ? formatOspPercentage(row.resultPercentage) : "-"}</TableCell>
                <TableCell>{row.effectiveDate || "—"}</TableCell>
                <TableCell className="max-w-xs whitespace-normal text-muted-foreground">{row.reference || row.note || "—"}</TableCell>
                <TableCell className="max-w-sm whitespace-normal">
                  <ClientResultAuditStatus effectiveDate={row.effectiveDate} warning={warningFor(row)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>ALL</TableCell>
              <TableCell className="text-right tabular-nums">{hasExactClientSnapshot ? formatOspCurrency(result.all.ospClosed) : "-"}</TableCell>
              <TableCell className="text-right tabular-nums">{hasExactClientSnapshot ? formatOspPercentage(result.all.resultPercentage) : "-"}</TableCell>
              <TableCell>{result.all.effectiveDate || "—"}</TableCell>
              <TableCell>{result.all.reference || result.all.note || "—"}</TableCell>
              <TableCell className="max-w-sm whitespace-normal">
                <ClientResultAuditStatus effectiveDate={hasExactClientSnapshot ? overview.asOf : null} warning={allWarning} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </section>
  );
}

function ClientResultAuditStatus({
  effectiveDate,
  warning,
}: {
  effectiveDate: string | null;
  warning: string | null;
}) {
  if (!effectiveDate) return <span className="text-xs text-muted-foreground">No client snapshot</span>;
  if (!warning) return <span className="text-xs text-muted-foreground">Consistent</span>;
  return (
    <span className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300" role="status">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {warning}
    </span>
  );
}

function ReconciledResultSection({
  overview,
  onDrilldown,
}: {
  overview: BillingPrincipalSavedTargetOverview;
  onDrilldown: (aging: BillingPrincipalAging | "ALL", source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "") => void;
}) {
  const result = overview.reconciledResult;
  return (
    <section aria-labelledby="billing-reconciled-result" className="overflow-hidden rounded-2xl border border-primary/25 bg-card">
      <div id="billing-reconciled-result">
        <SectionHeading
          number="D"
          title="Table D · Reconciled Result"
          description="System OSP plus eligible Table C adjustments, without double counting system Abort CP."
        />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="System OSP" value={formatOspCurrency(result.all.systemOspClosed)} />
        <Metric label="Table C OSP" value={formatOspCurrency(result.all.manualReconciledOsp)} />
        <div className="min-w-0 rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reconciled OSP</p>
          <p className="mt-1 text-lg">
            <DrilldownAmountButton
              value={result.all.reconciledOspClosed}
              label="Open reconciled OSP closed drilldown for all aging"
              onClick={() => onDrilldown("ALL", "")}
            />
          </p>
        </div>
        <Metric label="Reconciled result" value={formatOspPercentage(result.all.reconciledResultPercentage)} />
      </div>
      <ReconciledResultTable rows={result.rows} all={result.all} onDrilldown={onDrilldown} />
    </section>
  );
}

function ReconciledResultTable({
  rows,
  all,
  onDrilldown,
}: {
  rows: BillingPrincipalReconciledRow[];
  all: Omit<BillingPrincipalReconciledRow, "aging"> & { aging: "ALL" };
  onDrilldown: (aging: BillingPrincipalAging | "ALL", source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "") => void;
}) {
  return (
    <div className="overflow-x-auto border-t border-border/60">
      <Table aria-label="Reconciled Billing Principal result" className="min-w-[850px]">
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Aging</TableHead>
            <TableHead className="text-right">TT OSP</TableHead>
            <TableHead className="text-right">Target OSP</TableHead>
            <TableHead className="text-right">System OSP</TableHead>
            <TableHead className="text-right">Table C OSP</TableHead>
            <TableHead className="text-right">Reconciled OSP</TableHead>
            <TableHead className="text-right">Result %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.aging}>
              <TableCell className="font-semibold">{row.aging}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.totalOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.targetOsp)}</TableCell>
              <TableCell className="text-right"><DrilldownAmountButton value={row.systemOspClosed} label={`Open System contribution drilldown for ${row.aging}`} onClick={() => onDrilldown(row.aging, "SYSTEM_ABORT_CP")} /></TableCell>
              <TableCell className="text-right"><DrilldownAmountButton value={row.manualReconciledOsp} label={`Open Table C contribution drilldown for ${row.aging}`} onClick={() => onDrilldown(row.aging, "MANUAL_RECONCILIATION")} /></TableCell>
              <TableCell className="text-right"><DrilldownAmountButton value={row.reconciledOspClosed} label={`Open reconciled contribution drilldown for ${row.aging}`} onClick={() => onDrilldown(row.aging, "")} /></TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatOspPercentage(row.reconciledResultPercentage)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>ALL</TableCell>
            <TableCell className="text-right tabular-nums">{formatOspCurrency(all.totalOsp)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatOspCurrency(all.targetOsp)}</TableCell>
            <TableCell className="text-right"><DrilldownAmountButton value={all.systemOspClosed} label="Open all System contribution drilldown" onClick={() => onDrilldown("ALL", "SYSTEM_ABORT_CP")} /></TableCell>
            <TableCell className="text-right"><DrilldownAmountButton value={all.manualReconciledOsp} label="Open all Table C contribution drilldown" onClick={() => onDrilldown("ALL", "MANUAL_RECONCILIATION")} /></TableCell>
            <TableCell className="text-right"><DrilldownAmountButton value={all.reconciledOspClosed} label="Open all reconciled contribution drilldown" onClick={() => onDrilldown("ALL", "")} /></TableCell>
            <TableCell className="text-right tabular-nums">{formatOspPercentage(all.reconciledResultPercentage)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

export function BillingPrincipalSavedTargetWorkspace({
  role,
  target,
}: {
  role: string;
  target: BillingPrincipalSavedTarget;
}) {
  const range = useMemo(() => getTrackingRange(target), [target]);
  const [asOf, setAsOf] = useState(() => initialAsOf(target));
  const [overview, setOverview] = useState<BillingPrincipalSavedTargetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [drilldownRequest, setDrilldownRequest] = useState<BillingPrincipalDrilldownRequest | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getBillingPrincipalSavedTargetOverview(
      target.id,
      target.activeRevision.id,
      { asOf },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!controller.signal.aborted) setOverview(response);
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) {
          setOverview(null);
          setError(parseApiError(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [asOf, refreshVersion, target.activeRevision.id, target.id]);

  const refresh = () => setRefreshVersion((value) => value + 1);
  const openDrilldown = (
    aging: BillingPrincipalAging | "ALL",
    source: "SYSTEM_ABORT_CP" | "MANUAL_RECONCILIATION" | "",
  ) => setDrilldownRequest((current) => ({
    sequence: (current?.sequence ?? 0) + 1,
    date: "",
    aging: aging === "ALL" ? "" : aging,
    source,
  }));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-xl font-semibold">{target.name}</h2>
              <Badge className="rounded-full">Saved target</Badge>
              {role !== "superuser" ? <Badge variant="outline">Read only</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{target.description || "No description"}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Revision {target.activeRevision.revisionNumber} · period {target.activeRevision.from} to {target.activeRevision.to} · {target.activeRevision.sourceSnapshots.length} source snapshot{target.activeRevision.sourceSnapshots.length === 1 ? "" : "s"}
            </p>
            <div className="mt-3 space-y-2" aria-labelledby="billing-saved-source-snapshots">
              <p id="billing-saved-source-snapshots" className="text-xs font-medium text-foreground">
                Frozen source snapshots
              </p>
              <ul className="space-y-1.5">
                {target.activeRevision.sourceSnapshots.map((source) => (
                  <li
                    key={source.sourceImportId}
                    className="min-w-0 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs"
                  >
                    <span className="block break-words font-medium text-foreground">{source.name}</span>
                    <span className="block break-all text-muted-foreground">
                      {source.filename || "Filename unavailable"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="billing-saved-as-of" className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" /> As of
              </Label>
              <Input
                id="billing-saved-as-of"
                type="date"
                value={asOf}
                min={range.start}
                max={range.end}
                onChange={(event) => {
                  if (event.target.value) setAsOf(event.target.value);
                }}
                className="w-auto"
              />
            </div>
            <Button type="button" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>All calculations use this immutable revision. Account and customer identifiers remain masked in the browser.</p>
        </div>
      </section>

      {error ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={refresh}>Retry</Button>
          </div>
        </div>
      ) : null}

      {loading && !overview ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border/70 bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> Loading saved target overview...
        </div>
      ) : null}

      {overview ? (
        <>
          <SystemResultSection overview={overview} onDrilldown={openDrilldown} />
          <ClientResultSection target={target} overview={overview} role={role} onSaved={refresh} />
          <BillingPrincipalTableC
            target={target}
            asOf={overview.asOf}
            summary={overview.manualReconciliation}
            role={role}
            onChanged={refresh}
          />
          <ReconciledResultSection overview={overview} onDrilldown={openDrilldown} />
          <BillingPrincipalInsights target={target} overview={overview} drilldownRequest={drilldownRequest} />
        </>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {loading ? "Loading saved Billing Principal target." : overview ? "Saved Billing Principal target loaded." : ""}
      </p>
    </div>
  );
}
