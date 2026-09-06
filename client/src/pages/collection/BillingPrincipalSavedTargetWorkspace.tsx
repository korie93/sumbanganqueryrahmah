import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type BillingPrincipalSavedTarget,
  type BillingPrincipalSavedTargetOverview,
} from "@/lib/api/collection-billing-principal";
import { parseApiError, parseCollectionApiErrorDetails } from "@/pages/collection/utils";
import {
  BILLING_PRINCIPAL_AGINGS,
  calculateOspClientPreview,
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
    start: target.activeRevision.from,
    end: target.activeRevision.to,
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
}: {
  rows: BillingPrincipalSavedTargetOverview["systemResult"]["rows"];
  all: BillingPrincipalSavedTargetOverview["systemResult"]["all"];
}) {
  const rendered = [...rows, all];
  return (
    <div className="overflow-x-auto border-t border-border/60">
      <Table aria-label="Table A System Billing Principal result" className="min-w-[820px]">
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Aging</TableHead>
            <TableHead className="text-right">TT OSP</TableHead>
            <TableHead className="bg-primary/5 text-right">Target %</TableHead>
            <TableHead className="bg-primary/5 text-right">Target OSP</TableHead>
            <TableHead className="text-right">Result %</TableHead>
            <TableHead className="bg-status-online/10 text-right">OSP closed</TableHead>
            <TableHead className="text-right">Accounts</TableHead>
            <TableHead className="bg-status-away/10 text-right">Balance OSP</TableHead>
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
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.ospClosed)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.closedAccountCount.toLocaleString("en-MY")}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(row.balanceOsp)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ClientDraftRow = { targetPercentage: string; resultPercentage: string };
type ClientDraft = Record<BillingPrincipalAging, ClientDraftRow>;

export type BillingPrincipalWorkspaceInteraction = {
  dirty: boolean;
  saving: boolean;
  exporting: boolean;
};

export function billingPrincipalWorkspaceLockMessage(state: BillingPrincipalWorkspaceInteraction): string {
  if (state.saving) return "Saving your private Client Result. Wait before switching or changing targets.";
  if (state.exporting) return "Exporting your report. Wait before switching or changing targets.";
  if (state.dirty) return "Save or discard your private Client Result changes before switching, reloading, or changing targets.";
  return "";
}

export function protectBillingPrivateDraftOnUnload(target: EventTarget): () => void {
  const beforeUnload = (event: Event) => {
    event.preventDefault();
    // Browsers show their own standard warning; never put private draft data in it.
    (event as BeforeUnloadEvent).returnValue = "";
  };
  target.addEventListener("beforeunload", beforeUnload);
  return () => target.removeEventListener("beforeunload", beforeUnload);
}

function draftFromRows(rows: readonly BillingPrincipalClientRow[]): ClientDraft {
  return Object.fromEntries(BILLING_PRINCIPAL_AGINGS.map((aging) => {
    const row = rows.find((candidate) => candidate.aging === aging);
    return [aging, {
      targetPercentage: row?.targetPercentage ?? "0.0000",
      resultPercentage: row?.resultPercentage ?? "0.0000",
    }];
  })) as ClientDraft;
}

export function BillingPrincipalClientResultTable({
  target,
  overview,
  editable,
  saving,
  exporting,
  onSave,
  onDirtyChange,
}: {
  target: BillingPrincipalSavedTarget;
  overview: BillingPrincipalSavedTargetOverview;
  editable: boolean;
  saving: boolean;
  exporting: boolean;
  onSave: (draft: ClientDraft) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<ClientDraft>(() => draftFromRows(overview.clientResult.rows));
  const [error, setError] = useState("");
  const busy = saving || exporting;
  const dirty = target.activeRevision.agingScope.some((aging) => {
    const persisted = overview.clientResult.rows.find((row) => row.aging === aging);
    return draft[aging].targetPercentage !== (persisted?.targetPercentage ?? "0.0000")
      || draft[aging].resultPercentage !== (persisted?.resultPercentage ?? "0.0000");
  });
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const preview = calculateOspClientPreview(overview.clientResult.rows.map((row) => ({ ...row, ...draft[row.aging] })));

  useEffect(() => {
    setDraft(draftFromRows(overview.clientResult.rows));
    setError("");
  }, [overview.clientResult.rows]);

  const update = (aging: BillingPrincipalAging, field: keyof ClientDraftRow, value: string) => {
    setDraft((current) => ({ ...current, [aging]: { ...current[aging], [field]: value } }));
  };

  const save = async () => {
    if (busy) return;
    for (const aging of target.activeRevision.agingScope) {
      if (!isValidOspPercentageInput(draft[aging].targetPercentage)) {
        setError(`${aging} Target % must be between 0 and 100 with at most four decimal places.`);
        return;
      }
      if (!isValidOspPercentageInput(draft[aging].resultPercentage)) {
        setError(`${aging} Result % must be between 0 and 100 with at most four decimal places.`);
        return;
      }
      const baseline = overview.clientResult.rows.find((row) => row.aging === aging)?.totalOsp;
      if (baseline && /^0+(?:\.0+)?$/.test(baseline) && !/^0+(?:\.0+)?$/.test(draft[aging].resultPercentage.trim())) {
        setError(`${aging} has no TT OSP; its Result % must be zero.`); return;
      }
    }
    setError("");
    await onSave(draft);
  };

  const rows = target.activeRevision.agingScope.map((aging) => ({
    persisted: overview.clientResult.rows.find((candidate) => candidate.aging === aging),
    calculated: preview?.rows.find((candidate) => candidate.aging === aging),
    aging,
  }));

  return (
    <section aria-labelledby="billing-table-b-heading" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full border-chart-2/30 bg-chart-2/10">B</Badge>
            <h3 id="billing-table-b-heading" className="font-semibold">Client Result</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your private Target % and Result % only. Amounts and weighted ALL are derived from the saved TT OSP.
          </p>
          <Badge variant="outline" className="mt-2">{dirty ? "Unsaved changes — preview" : overview.clientResult.all.receivedDate ? "Saved to your account" : "Unsaved — defaults from TABLE A"}</Badge>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest client submission: {overview.clientResult.all.receivedDate ?? "Not submitted"}. It is independent of the Table A calendar.
          </p>
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
          {dirty ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setDraft(draftFromRows(overview.clientResult.rows)); setError(""); }}>Discard changes</Button> : null}
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy || (!dirty && Boolean(overview.clientResult.all.receivedDate))}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
            {saving ? "Saving…" : "Save Client Result"}
          </Button>
          </div>
        ) : null}
      </div>
      {error ? <p role="alert" className="mx-4 mb-4 text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto border-t border-border/60">
        <Table aria-label="Table B Client Billing Principal result" className="min-w-[760px]">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Aging</TableHead>
              <TableHead className="text-right">TT OSP</TableHead>
              <TableHead className="bg-primary/5 text-right">Target %</TableHead>
              <TableHead className="bg-primary/5 text-right">Target OSP</TableHead>
              <TableHead className="w-36 bg-chart-2/10 text-right">Client Result %</TableHead>
              <TableHead className="bg-status-online/10 text-right">Client OSP Closed</TableHead>
              <TableHead className="bg-status-away/10 text-right">Balance OSP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ aging, persisted, calculated }) => (
              <TableRow key={aging}>
                <TableCell className="font-semibold">{aging}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(persisted?.totalOsp)}</TableCell>
                <TableCell>{editable ? <Input aria-label={`${aging} private target percentage`} inputMode="decimal" value={draft[aging].targetPercentage} maxLength={8} onChange={(event) => update(aging, "targetPercentage", event.target.value)} disabled={busy} className="ml-auto w-28 text-right tabular-nums" /> : <span className="block text-right tabular-nums">{formatOspPercentage(persisted?.targetPercentage)}</span>}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(calculated?.targetOsp)}</TableCell>
                <TableCell>
                  {editable ? (
                    <Input
                      aria-label={`${aging} client result percentage`}
                      inputMode="decimal"
                      maxLength={8}
                      value={draft[aging].resultPercentage}
                      onChange={(event) => update(aging, "resultPercentage", event.target.value)}
                      disabled={busy}
                      className="text-right tabular-nums"
                    />
                  ) : <span className="block text-right tabular-nums">{formatOspPercentage(persisted?.resultPercentage)}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(calculated?.ospClosed)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOspCurrency(calculated?.balanceOsp)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>ALL</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(preview?.all.totalOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(preview?.all.targetPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(preview?.all.targetOsp)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspPercentage(preview?.all.resultPercentage)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(preview?.all.ospClosed)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOspCurrency(preview?.all.balanceOsp)}</TableCell>
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
  onInteractionChange,
}: {
  role: string;
  target: BillingPrincipalSavedTarget;
  onInteractionChange?: (state: BillingPrincipalWorkspaceInteraction) => void;
}) {
  const range = useMemo(() => trackingRange(target), [target]);
  const [asOf, setAsOf] = useState(() => initialAsOf(target));
  const [overview, setOverview] = useState<BillingPrincipalSavedTargetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [clientDirty, setClientDirty] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const saveAttemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  const saveAbortControllerRef = useRef<AbortController | null>(null);
  const saveRequestIdRef = useRef(0);
  const savingRef = useRef(false);
  const isMountedRef = useRef(true);

  const handleAccessLost = useCallback(() => {
    saveRequestIdRef.current += 1;
    saveAbortControllerRef.current?.abort();
    saveAbortControllerRef.current = null;
    savingRef.current = false;
    saveAttemptRef.current = null;
    setOverview(null); setClientDirty(false); setExportBusy(false); setSaving(false);
    setError("Saved Target access could not be confirmed. Reload targets before continuing.");
  }, []);

  useEffect(() => {
    onInteractionChange?.({ dirty: clientDirty, saving, exporting: exportBusy });
  }, [clientDirty, exportBusy, onInteractionChange, saving]);

  useEffect(() => {
    if (!clientDirty) return;
    return protectBillingPrivateDraftOnUnload(window);
  }, [clientDirty]);

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
    if (!overview || savingRef.current || exportBusy) return;
    const payload = {
      rows: target.activeRevision.agingScope.map((aging) => {
        const current = overview.clientResult.rows.find((row) => row.aging === aging);
        return {
          aging,
          targetPercentage: draft[aging].targetPercentage.trim(),
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
        if ([401, 403, 404].includes(parseCollectionApiErrorDetails(caught).status ?? 0)) handleAccessLost();
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
              <Input id="billing-system-as-of" type="date" min={range.start} max={range.end} value={asOf} disabled={saving || clientDirty || exportBusy} onChange={(event) => { if (event.target.value) setAsOf(event.target.value); }} />
            </div>
            <Button type="button" variant="outline" onClick={() => setRefreshVersion((value) => value + 1)} disabled={loading || saving || clientDirty || exportBusy}>
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
            <ResultTable rows={overview.systemResult.rows} all={overview.systemResult.all} />
          </section>
          <BillingPrincipalClientResultTable target={target} overview={overview} editable={["superuser", "manager", "admin"].includes(role)} saving={saving} exporting={exportBusy} onSave={saveClient} onDirtyChange={setClientDirty} />
          <section aria-labelledby="billing-latest-comparison" className="rounded-2xl border border-border/70 bg-card p-4">
            <h3 id="billing-latest-comparison" className="font-semibold">Latest Total Result Comparison</h3>
            <p className="mt-1 text-sm text-muted-foreground">This comparison is deliberately independent of the historical System date selector.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="min-w-0 rounded-xl border p-3"><p className="text-xs text-muted-foreground">System latest ALL · {comparison?.system.asOf}</p><p className="mt-1 font-semibold tabular-nums">{formatOspPercentage(comparison?.system.resultPercentage)}</p></div>
              <div className="min-w-0 rounded-xl border p-3"><p className="text-xs text-muted-foreground">Client latest ALL · {comparison?.client?.receivedDate ?? "No submission"}</p><p className="mt-1 font-semibold tabular-nums">{comparison?.client ? formatOspPercentage(comparison.client.resultPercentage) : "—"}</p></div>
              <div className="min-w-0 rounded-xl border p-3"><p className="text-xs text-muted-foreground">Difference (percentage points)</p><p className="mt-1 font-semibold tabular-nums">{comparison?.differencePercentagePoints == null ? "—" : formatOspPercentagePoint(comparison.differencePercentagePoints)}</p></div>
            </div>
          </section>
          <BillingPrincipalInsights target={target} overview={overview} disabled={saving || clientDirty} onAccessLost={handleAccessLost} onExportBusy={setExportBusy} />
        </>
      ) : null}
    </div>
  );
}
