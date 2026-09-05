import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  getBillingPrincipalSavedTargetOverview,
  prepareBillingPrincipalMutationAttempt,
  upsertBillingPrincipalClientResults,
  type BillingPrincipalAging,
  type BillingPrincipalClientRow,
  type BillingPrincipalMutationAttempt,
  type BillingPrincipalReportRow,
  type BillingPrincipalSavedTarget,
  type BillingPrincipalSavedTargetOverview,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "@/pages/collection/utils";
import {
  BILLING_PRINCIPAL_AGINGS,
  formatOspCurrency,
  formatOspPercentage,
  formatOspPercentagePoint,
  isValidOspPercentageInput,
} from "./billing-principal-report-utils";
import { BillingPrincipalInsights } from "./BillingPrincipalInsights";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function todayIsoDate() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function trackingRange(target: BillingPrincipalSavedTarget) {
  return {
    start: target.activeRevision.trackingStartDate || target.activeRevision.from,
    end: target.activeRevision.trackingEndDate || target.activeRevision.to,
  };
}

function initialAsOf(target: BillingPrincipalSavedTarget) {
  const range = trackingRange(target);
  return todayIsoDate() < range.start
    ? range.start
    : todayIsoDate() > range.end
      ? range.end
      : todayIsoDate();
}

function ResultTable({
  rows,
  all,
  onOpenDrilldown,
}: {
  rows: BillingPrincipalReportRow[];
  all: Omit<BillingPrincipalReportRow, "aging"> & { aging: "ALL" };
  onOpenDrilldown: (aging: BillingPrincipalAging | "ALL") => void;
}) {
  const rendered = [...rows, all];
  return (
    <div className="overflow-x-auto border-t border-border/60">
      <Table aria-label="Table A System Billing Principal result" className="min-w-[820px]">
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Aging</TableHead>
            <TableHead className="text-right">TT OSP</TableHead>
            <TableHead className="text-right">Target %</TableHead>
            <TableHead className="text-right">Target OSP</TableHead>
            <TableHead className="text-right">Result %</TableHead>
            <TableHead className="text-right">OSP closed</TableHead>
            <TableHead className="text-right">Accounts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rendered.map((row) => (
            <TableRow key={row.aging} className={row.aging === "ALL" ? "font-semibold" : undefined}>
              <TableCell>{row.aging}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.totalOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(row.targetPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.targetOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(row.resultPercentage)}</TableCell>
              <TableCell className="text-right">
                <button
                  type="button"
                  className="font-semibold tabular-nums text-primary underline decoration-primary/40 underline-offset-4"
                  onClick={() => onOpenDrilldown(row.aging)}
                  aria-label={`Open ${row.aging} OSP closed account detail, ${formatOspCurrency(row.ospClosed)}`}
                >
                  {formatOspCurrency(row.ospClosed)}
                </button>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.closedAccountCount.toLocaleString("en-MY")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ClientDraftRow = { resultPercentage: string };
type ClientDraft = Record<BillingPrincipalAging, ClientDraftRow>;

function draftFromRows(rows: readonly BillingPrincipalClientRow[]): ClientDraft {
  return Object.fromEntries(BILLING_PRINCIPAL_AGINGS.map((aging) => {
    const row = rows.find((candidate) => candidate.aging === aging);
    return [aging, {
      resultPercentage: row?.resultPercentage ?? "0.0000",
    }];
  })) as ClientDraft;
}

function ClientResultTable({
  target,
  overview,
  editable,
  saving,
  onSave,
}: {
  target: BillingPrincipalSavedTarget;
  overview: BillingPrincipalSavedTargetOverview;
  editable: boolean;
  saving: boolean;
  onSave: (draft: ClientDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ClientDraft>(() => draftFromRows(overview.clientResult.rows));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(draftFromRows(overview.clientResult.rows));
    setError("");
  }, [overview.clientResult.rows]);

  const update = (aging: BillingPrincipalAging, field: keyof ClientDraftRow, value: string) => {
    setDraft((current) => ({ ...current, [aging]: { ...current[aging], [field]: value } }));
  };

  const save = async () => {
    for (const aging of target.activeRevision.agingScope) {
      if (!isValidOspPercentageInput(draft[aging].resultPercentage)) {
        setError(`${aging} Result % must be between 0 and 100 with at most four decimal places.`);
        return;
      }
    }
    setError("");
    await onSave(draft);
  };

  const rows = target.activeRevision.agingScope.map((aging) => ({
    persisted: overview.clientResult.rows.find((candidate) => candidate.aging === aging),
    aging,
  }));

  return (
    <section aria-labelledby="billing-table-b-heading" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="rounded-full">B</Badge>
            <h3 id="billing-table-b-heading" className="font-semibold">Client Result</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Only D3–D6 Client Result % is editable. TT OSP, target values, Client OSP Closed and ALL are canonical derived values.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest client submission: {overview.clientResult.all.receivedDate ?? "Not submitted"}. It is independent of the Table A calendar.
          </p>
        </div>
        {editable ? (
          <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
            {saving ? "Saving…" : "Save Client Result"}
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="mx-4 mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto border-t border-border/60">
        <Table aria-label="Table B Client Billing Principal result" className="min-w-[760px]">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Aging</TableHead>
              <TableHead className="text-right">TT OSP</TableHead>
              <TableHead className="text-right">Target %</TableHead>
              <TableHead className="text-right">Target OSP</TableHead>
              <TableHead className="w-36 text-right">Client Result %</TableHead>
              <TableHead className="text-right">Client OSP Closed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ aging, persisted }) => (
              <TableRow key={aging}>
                <TableCell className="font-semibold">{aging}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(persisted?.totalOsp)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspPercentage(persisted?.targetPercentage)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(persisted?.targetOsp)}</TableCell>
                <TableCell>
                  {editable ? (
                    <Input
                      aria-label={`${aging} client result percentage`}
                      inputMode="decimal"
                      value={draft[aging].resultPercentage}
                      onChange={(event) => update(aging, "resultPercentage", event.target.value)}
                      disabled={saving}
                      className="text-right tabular-nums"
                    />
                  ) : <span className="block text-right tabular-nums">{formatOspPercentage(persisted?.resultPercentage)}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{persisted?.receivedDate ? formatOspCurrency(persisted.ospClosed) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>ALL</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(overview.clientResult.all.totalOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(overview.clientResult.all.targetPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(overview.clientResult.all.targetOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{overview.clientResult.all.receivedDate ? formatOspPercentage(overview.clientResult.all.resultPercentage) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{overview.clientResult.all.receivedDate ? formatOspCurrency(overview.clientResult.all.ospClosed) : "—"}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </section>
  );
}

export function BillingPrincipalSavedTargetWorkspace({
  role,
  target,
}: {
  role: string;
  target: BillingPrincipalSavedTarget;
}) {
  const range = useMemo(() => trackingRange(target), [target]);
  const [asOf, setAsOf] = useState(() => initialAsOf(target));
  const [overview, setOverview] = useState<BillingPrincipalSavedTargetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [drilldownAging, setDrilldownAging] = useState<BillingPrincipalAging | "ALL" | null>(null);
  const saveAttemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  const saveAbortControllerRef = useRef<AbortController | null>(null);
  const saveRequestIdRef = useRef(0);
  const savingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      saveRequestIdRef.current += 1;
      saveAbortControllerRef.current?.abort();
      saveAbortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setOverview(null);
    getBillingPrincipalSavedTargetOverview(
      target.id,
      target.activeRevision.id,
      { asOf },
      { signal: controller.signal },
    ).then((response) => {
      if (!controller.signal.aborted) setOverview(response);
    }).catch((caught) => {
      if (!controller.signal.aborted && !isAbortError(caught)) setError(parseApiError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [asOf, refreshVersion, target.activeRevision.id, target.id]);

  const saveClient = async (draft: ClientDraft) => {
    if (!overview || savingRef.current) return;
    const payload = {
      rows: target.activeRevision.agingScope.map((aging) => {
        const current = overview.clientResult.rows.find((row) => row.aging === aging);
        return {
          aging,
          resultPercentage: draft[aging].resultPercentage.trim(),
          ...(current?.note == null ? {} : { note: current.note }),
          ...(current?.reference == null ? {} : { reference: current.reference }),
          ...(current?.version == null ? {} : { version: current.version }),
        };
      }),
    };
    const attempt = prepareBillingPrincipalMutationAttempt(
      "client-results:upsert",
      { targetId: target.id, revisionId: target.activeRevision.id, payload },
      saveAttemptRef.current,
    );
    saveAttemptRef.current = attempt;
    saveAbortControllerRef.current?.abort();
    const controller = new AbortController();
    saveAbortControllerRef.current = controller;
    const requestId = ++saveRequestIdRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await upsertBillingPrincipalClientResults(
        target.id,
        target.activeRevision.id,
        payload,
        { ...attempt, signal: controller.signal },
      );
      if (controller.signal.aborted || !isMountedRef.current || requestId !== saveRequestIdRef.current) return;
      saveAttemptRef.current = null;
      setOverview((current) => current ? {
        ...current,
        clientResult: response.clientResult,
        latestComparison: response.latestComparison,
      } : current);
    } catch (caught) {
      if (!controller.signal.aborted && !isAbortError(caught) && isMountedRef.current && requestId === saveRequestIdRef.current) {
        setError(parseApiError(caught));
      }
    } finally {
      if (saveAbortControllerRef.current === controller) saveAbortControllerRef.current = null;
      if (isMountedRef.current && requestId === saveRequestIdRef.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  const comparison = overview?.latestComparison;
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{target.name}</h2>
              <Badge variant="outline">Revision {target.activeRevision.revisionNumber}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Immutable TT OSP baseline · System and Client results only.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="billing-system-as-of">System as of</Label>
              <Input id="billing-system-as-of" type="date" min={range.start} max={range.end} value={asOf} onChange={(event) => setAsOf(event.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={() => setRefreshVersion((value) => value + 1)} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
            </Button>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>Table A counts each eligible account once using its saved Billing Principal OSP. Manual verified POOL values stay external to Collection amounts and user performance.</p>
        </div>
      </section>

      {error ? (
        <div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      ) : null}
      {loading && !overview ? (
        <div className="flex min-h-44 items-center justify-center rounded-2xl border border-border/70 bg-card text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> Loading Billing Principal…
        </div>
      ) : null}

      {overview ? (
        <>
          <section aria-labelledby="billing-table-a-heading" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            <div className="p-4">
              <div className="flex items-center gap-2"><Badge className="rounded-full">A</Badge><h3 id="billing-table-a-heading" className="font-semibold">System Result</h3></div>
              <p className="mt-1 text-sm text-muted-foreground">Effective automatic ABORT CP plus valid Manual Verified ABORT, with each logical account counted once.</p>
            </div>
            <ResultTable rows={overview.systemResult.rows} all={overview.systemResult.all} onOpenDrilldown={setDrilldownAging} />
          </section>
          <ClientResultTable target={target} overview={overview} editable={role === "superuser"} saving={saving} onSave={saveClient} />
          <section aria-labelledby="billing-latest-comparison" className="rounded-2xl border border-border/70 bg-card p-4">
            <h3 id="billing-latest-comparison" className="font-semibold">Latest Total Result Comparison</h3>
            <p className="mt-1 text-sm text-muted-foreground">This comparison is deliberately independent of the historical System date selector.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 rounded-xl border p-3"><p className="text-xs text-muted-foreground">System latest ALL · {comparison?.system.asOf}</p><p className="mt-1 font-semibold tabular-nums">{formatOspPercentage(comparison?.system.resultPercentage)}</p></div>
              <div className="min-w-0 rounded-xl border p-3"><p className="text-xs text-muted-foreground">Client latest ALL · {comparison?.client?.receivedDate ?? "No submission"}</p><p className="mt-1 font-semibold tabular-nums">{comparison?.client ? formatOspPercentage(comparison.client.resultPercentage) : "—"}</p></div>
              <div className="min-w-0 rounded-xl border p-3"><p className="text-xs text-muted-foreground">Difference (percentage points)</p><p className="mt-1 font-semibold tabular-nums">{comparison?.differencePercentagePoints == null ? "—" : formatOspPercentagePoint(comparison.differencePercentagePoints)}</p></div>
            </div>
          </section>
          <BillingPrincipalInsights target={target} overview={overview} requestedAging={drilldownAging} onRequestHandled={() => setDrilldownAging(null)} />
        </>
      ) : null}
    </div>
  );
}
