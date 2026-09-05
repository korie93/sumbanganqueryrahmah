import { useEffect, useRef, useState } from "react";
import { AlertTriangle, History, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getCollectionManualSettlementHistory,
  prepareCollectionManualSettlementMutationAttempt,
  revokeCollectionManualSettlement,
  upsertCollectionManualSettlement,
  type CollectionManualSettlementMutationAttempt,
  type CollectionRecord,
} from "@/lib/api";
import { emitCollectionDataChanged, getTodayIsoDate, parseApiError } from "@/pages/collection/utils";
import { formatCollectionOptionalAmount } from "./collection-coverage";

const REASONS = [
  ["EXTERNAL_UNASSIGNED_PAYMENT", "External / unassigned payment"],
  ["CLIENT_CONFIRMED_PAYMENT", "Client-confirmed payment"],
  ["HISTORICAL_PAYMENT_NOT_CAPTURED", "Historical payment not captured"],
  ["OTHER_WITH_REQUIRED_NOTE", "Other (note required)"],
] as const;

type Reason = typeof REASONS[number][0];
type HistoryItem = Awaited<ReturnType<typeof getCollectionManualSettlementHistory>>["history"][number];

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function cpStatusLabel(status: CollectionRecord["cpStatus"] | CollectionRecord["automaticCpStatus"]) {
  return status === "abort_cp" ? "ABORT CP" : status === "cp" ? "CP" : "Unverified";
}

function maximumSettlementDate(record: CollectionRecord) {
  const today = getTodayIsoDate();
  return record.callingWindowEnd && record.callingWindowEnd < today
    ? record.callingWindowEnd
    : today;
}

function defaultSettlementDate(record: CollectionRecord) {
  const maximum = maximumSettlementDate(record);
  const preferred = record.manualSettlement?.settlementDate || record.paymentDate || maximum;
  const minimum = record.callingDate || "0000-01-01";
  return preferred < minimum ? minimum : preferred > maximum ? maximum : preferred;
}

export function CollectionManualSettlementPanel({
  record,
  canManage,
  disabled,
  onChanged,
}: {
  record: CollectionRecord;
  canManage: boolean;
  disabled: boolean;
  onChanged: (record: CollectionRecord) => void | Promise<void>;
}) {
  const [poolAmount, setPoolAmount] = useState(record.manualSettlement?.poolAmount || "");
  const [settlementDate, setSettlementDate] = useState(() => defaultSettlementDate(record));
  const [reason, setReason] = useState<Reason>(record.manualSettlement?.reason || "EXTERNAL_UNASSIGNED_PAYMENT");
  const [note, setNote] = useState(record.manualSettlement?.note || "");
  const [reference, setReference] = useState(record.manualSettlement?.reference || "");
  const [confirmed, setConfirmed] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const verifyAttempt = useRef<CollectionManualSettlementMutationAttempt | null>(null);
  const revokeAttempt = useRef<CollectionManualSettlementMutationAttempt | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const mutationAbort = useRef<AbortController | null>(null);
  const mutationRequestId = useRef(0);
  const activeRecordId = useRef(record.id);
  const maximumAllowedSettlementDate = maximumSettlementDate(record);
  const settlementDateIsAllowed = Boolean(
    settlementDate
    && settlementDate <= maximumAllowedSettlementDate
    && (!record.callingDate || settlementDate >= record.callingDate),
  );

  useEffect(() => {
    activeRecordId.current = record.id;
    historyAbort.current?.abort();
    historyAbort.current = null;
    mutationRequestId.current += 1;
    mutationAbort.current?.abort();
    mutationAbort.current = null;
    setPoolAmount(record.manualSettlement?.poolAmount || "");
    setSettlementDate(defaultSettlementDate(record));
    setReason(record.manualSettlement?.reason || "EXTERNAL_UNASSIGNED_PAYMENT");
    setNote(record.manualSettlement?.note || "");
    setReference(record.manualSettlement?.reference || "");
    setConfirmed(false); setRevokeConfirmed(false); setRevokeReason(""); setError(""); setSaving(false);
    setHistory(null); setHistoryLoading(false);
    verifyAttempt.current = null; revokeAttempt.current = null;
  }, [record]);

  useEffect(() => () => {
    historyAbort.current?.abort();
    mutationRequestId.current += 1;
    mutationAbort.current?.abort();
  }, []);

  const verify = async () => {
    if (!confirmed || saving || !settlementDateIsAllowed) return;
    const payload = {
      poolAmount: poolAmount.trim(), settlementDate, reason,
      note: note.trim() || null, reference: reference.trim() || null,
      expectedVersion: record.manualSettlement?.version ?? null, confirmed: true as const,
    };
    const attempt = prepareCollectionManualSettlementMutationAttempt("verify", record.id, payload, verifyAttempt.current);
    verifyAttempt.current = attempt;
    mutationAbort.current?.abort();
    const controller = new AbortController();
    const requestId = ++mutationRequestId.current;
    const requestedRecordId = record.id;
    mutationAbort.current = controller; setSaving(true); setError("");
    try {
      const response = await upsertCollectionManualSettlement(record.id, payload, {
        ...attempt,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== mutationRequestId.current) return;
      verifyAttempt.current = null;
      if (activeRecordId.current === requestedRecordId) {
        setConfirmed(false);
        await onChanged(response.record as CollectionRecord);
        emitCollectionDataChanged();
      }
    } catch (caught) {
      if (!controller.signal.aborted && !isAbortError(caught) && activeRecordId.current === requestedRecordId) {
        setError(parseApiError(caught));
      }
    } finally {
      if (mutationAbort.current === controller) {
        mutationAbort.current = null;
        setSaving(false);
      }
    }
  };

  const revoke = async () => {
    const version = record.manualSettlement?.version;
    if (!version || !revokeConfirmed || !revokeReason.trim() || saving) return;
    const payload = { expectedVersion: version, revokeReason: revokeReason.trim(), confirmed: true as const };
    const attempt = prepareCollectionManualSettlementMutationAttempt("revoke", record.id, payload, revokeAttempt.current);
    revokeAttempt.current = attempt;
    mutationAbort.current?.abort();
    const controller = new AbortController();
    const requestId = ++mutationRequestId.current;
    const requestedRecordId = record.id;
    mutationAbort.current = controller; setSaving(true); setError("");
    try {
      const response = await revokeCollectionManualSettlement(record.id, payload, {
        ...attempt,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== mutationRequestId.current) return;
      revokeAttempt.current = null;
      if (activeRecordId.current === requestedRecordId) {
        setRevokeConfirmed(false); setRevokeReason("");
        await onChanged(response.record as CollectionRecord);
        emitCollectionDataChanged();
      }
    } catch (caught) {
      if (!controller.signal.aborted && !isAbortError(caught) && activeRecordId.current === requestedRecordId) {
        setError(parseApiError(caught));
      }
    } finally {
      if (mutationAbort.current === controller) {
        mutationAbort.current = null;
        setSaving(false);
      }
    }
  };

  const loadHistory = async () => {
    if (historyLoading) return;
    historyAbort.current?.abort();
    const controller = new AbortController();
    const requestedRecordId = record.id;
    historyAbort.current = controller; setHistoryLoading(true); setError("");
    try {
      const response = await getCollectionManualSettlementHistory(requestedRecordId, {
        signal: controller.signal,
        limit: 50,
      });
      if (!controller.signal.aborted && activeRecordId.current === requestedRecordId) {
        setHistory(response.history);
      }
    } catch (caught) {
      if (!controller.signal.aborted && activeRecordId.current === requestedRecordId) {
        setError(parseApiError(caught));
      }
    } finally {
      if (historyAbort.current === controller) {
        historyAbort.current = null;
        setHistoryLoading(false);
      }
    }
  };

  const manual = record.manualSettlement;
  const structurallyEligible = Boolean(record.sourceImportId && record.sourceDataRowId && record.callingDate && record.totalDue);
  return (
    <section aria-labelledby="manual-settlement-heading" className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /><h3 id="manual-settlement-heading" className="font-semibold">Manual Verified ABORT · POOL</h3>{manual ? <Badge variant={manual.validity === "EFFECTIVE" ? "default" : "outline"}>{manual.validity.replace(/_/g, " ")}</Badge> : <Badge variant="outline">Not set</Badge>}</div>
          <p className="mt-1 text-sm text-muted-foreground">POOL is verified external payment evidence. It never changes Amount, receipts, staff totals, or performance.</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => void loadHistory()} disabled={historyLoading}>
          {historyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />} Audit history
        </Button>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">This user Collection</dt><dd className="font-semibold">{formatCollectionOptionalAmount(record.amount)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">System collected at settlement</dt><dd className="font-semibold">{manual ? formatCollectionOptionalAmount(manual.systemCollectedAtSettlement) : formatCollectionOptionalAmount(record.cumulativeCollected)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">POOL</dt><dd className="font-semibold">{formatCollectionOptionalAmount(manual?.poolAmount)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Reconciled settlement</dt><dd className="font-semibold">{formatCollectionOptionalAmount(manual?.effectiveTotal)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">TOTAL DUE</dt><dd className="font-semibold">{formatCollectionOptionalAmount(record.totalDue)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Automatic status</dt><dd className="font-semibold">{cpStatusLabel(record.automaticCpStatus)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Effective status</dt><dd className="font-semibold">{cpStatusLabel(record.cpStatus)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Status source</dt><dd className="font-semibold">{record.effectiveSettlementSource || "NONE"}</dd></div>
      </dl>
      {manual ? <p className="text-xs text-muted-foreground">Settlement {manual.settlementDate} · v{manual.version} · verified by {manual.verifiedBy} · source {record.effectiveSettlementSource || "NONE"}{manual.revokedReason ? ` · revoked: ${manual.revokedReason}` : ""}</p> : null}

      {history ? <div className="max-h-40 overflow-auto rounded-lg border bg-background p-2 text-xs">{history.length ? history.map((entry) => <div key={entry.id} className="border-b py-2 last:border-0"><strong>{entry.action}</strong> · {entry.actor} · {new Date(entry.timestamp).toLocaleString("en-MY")}</div>) : <p className="text-muted-foreground">No manual settlement audit events.</p>}</div> : null}

      {!canManage ? <p className="rounded-lg border p-3 text-sm text-muted-foreground">Read-only. Only a superuser can verify, update, re-verify, or revoke this POOL.</p> : null}
      {canManage && record.automaticCpStatus === "abort_cp" && manual?.status !== "ACTIVE" ? <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />This account is already automatic ABORT CP; a POOL override is not allowed.</p> : null}
      {canManage && !structurallyEligible ? <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A trusted saved-source match, Calling Date, and TOTAL DUE are required.</p> : null}

      {canManage && structurallyEligible && !(record.automaticCpStatus === "abort_cp" && manual?.status !== "ACTIVE") ? (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="manual-pool-amount">POOL amount (RM)</Label><Input id="manual-pool-amount" inputMode="decimal" value={poolAmount} onChange={(event) => setPoolAmount(event.target.value)} disabled={disabled || saving} /></div>
            <div className="space-y-1"><Label htmlFor="manual-settlement-date">Settlement date</Label><Input id="manual-settlement-date" type="date" min={record.callingDate || undefined} max={maximumAllowedSettlementDate} value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} disabled={disabled || saving} /></div>
            <div className="space-y-1"><Label htmlFor="manual-settlement-reason">Reason</Label><select id="manual-settlement-reason" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value as Reason)} disabled={disabled || saving}>{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="manual-settlement-reference">Evidence reference</Label><Input id="manual-settlement-reference" maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} disabled={disabled || saving} /></div><div className="space-y-1"><Label htmlFor="manual-settlement-note">Note{reason === "OTHER_WITH_REQUIRED_NOTE" ? " (required)" : ""}</Label><Textarea id="manual-settlement-note" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} disabled={disabled || saving} /></div></div>
          <label className="flex items-start gap-2 text-sm"><Checkbox aria-label="Confirm verified external payment evidence" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} disabled={disabled || saving} /><span>I confirm this external/unassigned payment evidence is verified and understand it does not become a Collection amount.</span></label>
          <Button type="button" onClick={() => void verify()} disabled={disabled || saving || !confirmed || !poolAmount.trim() || !settlementDateIsAllowed || (reason === "OTHER_WITH_REQUIRED_NOTE" && !note.trim())}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{manual ? "Update / re-verify POOL" : "Verify Manual ABORT"}</Button>
        </div>
      ) : null}

      {canManage && manual?.status === "ACTIVE" ? <div className="space-y-3 border-t border-destructive/30 pt-4"><div className="space-y-1"><Label htmlFor="manual-revoke-reason">Revocation reason</Label><Textarea id="manual-revoke-reason" maxLength={500} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} disabled={disabled || saving} /></div><label className="flex items-start gap-2 text-sm"><Checkbox aria-label="Confirm Manual ABORT revocation" checked={revokeConfirmed} onCheckedChange={(value) => setRevokeConfirmed(value === true)} disabled={disabled || saving} /><span>I confirm this revocation. Audit history will be retained.</span></label><Button type="button" variant="destructive" onClick={() => void revoke()} disabled={disabled || saving || !revokeConfirmed || !revokeReason.trim()}>Revoke Manual ABORT</Button></div> : null}
      {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
