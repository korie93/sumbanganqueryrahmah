import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import { getBillingPrincipalReportingWindow } from "@/lib/billing-principal-date-domain";
import {
  createBillingPrincipalSavedTarget, getBillingPrincipalSavedTargetOverview, getBillingPrincipalTargetOptions,
  prepareBillingPrincipalMutationAttempt, previewBillingPrincipalSource, updateBillingPrincipalSavedTarget,
  type BillingPrincipalAging, type BillingPrincipalMutationAttempt, type BillingPrincipalSavedTarget,
  type BillingPrincipalSourcePreview, type BillingPrincipalTargetOptions,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "./utils";
import { BILLING_PRINCIPAL_AGINGS, calculateTargetOspPreview, formatOspCurrency } from "./billing-principal-report-utils";

const selectClass = "min-h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
type AdminOption = BillingPrincipalTargetOptions["admins"][number];
type SourceOption = BillingPrincipalTargetOptions["sources"][number];

export function addBillingPrincipalSelectedSource(selected: SourceOption[], source: SourceOption): SourceOption[] {
  if (selected.length >= 5 || selected.some((item) => item.id === source.id)) return selected;
  return [...selected, source];
}

export function billingPrincipalPreviewMatchesSources(preview: BillingPrincipalSourcePreview | null, sources: SourceOption[]) {
  return Boolean(preview && sources.length > 0 && sources.length <= 5
    && new Set(sources.map((source) => source.id)).size === sources.length
    && new Set(preview.sourceImportIds).size === sources.length
    && preview.sourceImportIds.length === sources.length
    && sources.every((source) => preview.sourceImportIds.includes(source.id)));
}

export function validateBillingPrincipalTargetFields(name: string, percentages: Record<BillingPrincipalAging, string>) {
  const normalizedName = name.trim();
  const invalidControl = Array.from(normalizedName).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
  const nameError = !normalizedName ? "Target name is required."
    : normalizedName.length > 120 ? "Target name must be 120 characters or fewer."
      : invalidControl || /<\/?[a-z][^>]*>|(?:javascript|data)\s*:/i.test(normalizedName)
        ? "Target name must be plain text without HTML, scripts or invalid control characters." : "";
  const percentageErrors = Object.fromEntries(BILLING_PRINCIPAL_AGINGS.map((aging) => {
    const value = percentages[aging].trim();
    // Match the backend decimal input contract; signs, separators and exponent notation are not percentages.
    const valid = /^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(value);
    return [aging, valid ? "" : `${aging} Target % must be between 0 and 100, with at most four decimals.`];
  })) as Record<BillingPrincipalAging, string>;
  return { nameError, percentageErrors, valid: !nameError && BILLING_PRINCIPAL_AGINGS.every((aging) => !percentageErrors[aging]) };
}

function OptionPager({ page, hasMore, disabled, onPage, label }: {
  page: number; hasMore: boolean; disabled: boolean; onPage: (page: number) => void; label: string;
}) {
  if (page === 1 && !hasMore) return null;
  return <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <Button type="button" size="sm" variant="ghost" disabled={disabled || page === 1} onClick={() => onPage(page - 1)} aria-label={`Previous ${label} page`}>Previous</Button>
    <span>Page {page}</span>
    <Button type="button" size="sm" variant="ghost" disabled={disabled || !hasMore} onClick={() => onPage(page + 1)} aria-label={`Next ${label} page`}>Next</Button>
  </div>;
}

function TargetForm({ target, onSaved, onCancel, onBusy }: {
  target: BillingPrincipalSavedTarget | undefined;
  onSaved: (target: BillingPrincipalSavedTarget) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState(target?.name ?? "");
  const [description, setDescription] = useState(target?.description ?? "");
  const [admin, setAdmin] = useState<AdminOption | null>(target?.assignedAdmin ?? null);
  const [selectedSources, setSelectedSources] = useState<SourceOption[]>([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [adminPage, setAdminPage] = useState(1);
  const [sourcePage, setSourcePage] = useState(1);
  const [options, setOptions] = useState<BillingPrincipalTargetOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [preview, setPreview] = useState<BillingPrincipalSourcePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(Boolean(target));
  const [previewError, setPreviewError] = useState("");
  const [percentages, setPercentages] = useState<Record<BillingPrincipalAging, string>>({ D3: "0", D4: "0", D5: "0", D6: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const saveRef = useRef<AbortController | null>(null);
  const attemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  const validation = validateBillingPrincipalTargetFields(name, percentages);
  const sourcePreviewReady = Boolean(target) || billingPrincipalPreviewMatchesSources(preview, selectedSources);
  const createAdminId = target ? null : admin?.id;

  useEffect(() => () => saveRef.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setOptions(null);
    setOptionsLoading(true);
    setOptionsError("");
    const timer = window.setTimeout(() => {
      void getBillingPrincipalTargetOptions({ adminSearch, sourceSearch, adminPage, sourcePage, pageSize: 25 }, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setOptions(result); })
        .catch((caught: unknown) => { if (!controller.signal.aborted) setOptionsError(parseApiError(caught)); })
        .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [adminSearch, sourceSearch, adminPage, sourcePage, createAdminId, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setPreviewError("");
    setPreviewLoading(Boolean(target || selectedSources.length));
    if (target) {
      void getBillingPrincipalSavedTargetOverview(target.id, target.activeRevision.id, { asOf: getBillingPrincipalReportingWindow(target.activeRevision).from }, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.target.version !== target.version) throw new Error("Target changed. Close this dialog and reload targets before editing.");
          const reportingWindow = getBillingPrincipalReportingWindow(result.revision);
          setPreview({ ok: true, from: reportingWindow.from, to: reportingWindow.to, sourceImportIds: result.revision.sourceImportIds,
            rows: result.systemResult.rows.map((row) => ({ aging: row.aging, totalOsp: row.totalOsp, accountCount: 0 })) });
          setPercentages(Object.fromEntries(result.systemResult.rows.map((row) => [row.aging, row.targetPercentage])) as Record<BillingPrincipalAging, string>);
        })
        .catch((caught: unknown) => { if (!controller.signal.aborted) setPreviewError(parseApiError(caught)); })
        .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    } else if (createAdminId && selectedSources.length > 0) {
      void previewBillingPrincipalSource(selectedSources.map((source) => source.id), { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setPreview(result); })
        .catch((caught: unknown) => { if (!controller.signal.aborted) setPreviewError(parseApiError(caught)); })
        .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    }
    return () => controller.abort();
  }, [selectedSources, createAdminId, target, retry]);

  const changeSources = (sources: SourceOption[]) => {
    setSelectedSources(sources);
    // Invalidate synchronously: an earlier preview must never be submitted for a new selection.
    setPreview(null);
    setPreviewError("");
    setPreviewLoading(sources.length > 0);
    setError("");
  };

  const save = async () => {
    if (saveRef.current || !preview || !admin || !sourcePreviewReady || previewLoading || optionsLoading || optionsError || previewError) return;
    if (!validation.valid) {
      setError("Check the highlighted target fields before saving."); return;
    }
    const targets = BILLING_PRINCIPAL_AGINGS.map((agingBucket) => ({
      agingBucket, targetPercentage: percentages[agingBucket],
      totalOspBaseline: preview.rows.find((row) => row.aging === agingBucket)?.totalOsp ?? null,
    }));
    const shared = { name: name.trim(), description: description.trim() || null, assignedAdminUserId: admin.id, targets };
    const payload = target ? { ...shared, version: target.version } : {
      ...shared, sourceImportIds: preview.sourceImportIds, from: preview.from, to: preview.to,
      nicknameScope: [], agingScope: [...BILLING_PRINCIPAL_AGINGS],
    };
    const attempt = prepareBillingPrincipalMutationAttempt(target ? "saved-target:update" : "saved-target:create",
      target ? { targetId: target.id, payload } : payload, attemptRef.current);
    attemptRef.current = attempt;
    const controller = new AbortController();
    saveRef.current = controller;
    setSaving(true); onBusy(true); setError("");
    try {
      const requestOptions = { ...attempt, signal: controller.signal };
      const result = target
        ? await updateBillingPrincipalSavedTarget(target.id, { ...shared, version: target.version }, requestOptions)
        : await createBillingPrincipalSavedTarget({ ...shared, sourceImportIds: preview.sourceImportIds, from: preview.from, to: preview.to,
          nicknameScope: [], agingScope: [...BILLING_PRINCIPAL_AGINGS] }, requestOptions);
      if (!controller.signal.aborted) onSaved(result.target);
    } catch (caught) {
      if (!controller.signal.aborted) setError(parseApiError(caught));
    } finally {
      if (!controller.signal.aborted) { saveRef.current = null; setSaving(false); onBusy(false); }
    }
  };
  const admins = admin && !options?.admins.some((item) => item.id === admin.id) ? [admin, ...(options?.admins ?? [])] : options?.admins ?? [];
  const sources = (options?.sources ?? []).filter((item) => !selectedSources.some((selected) => selected.id === item.id));

  return <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="min-w-0 space-y-5">
    <fieldset disabled={saving} className="min-w-0 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="osp-assigned-admin">1. Assigned admin account</Label>
        <Input aria-label="Search admin accounts" value={adminSearch} maxLength={120} placeholder="Search username or name" onChange={(event) => { setAdminSearch(event.target.value); setAdminPage(1); }} />
        <select id="osp-assigned-admin" required value={admin?.id ?? ""} className={selectClass} disabled={optionsLoading} onChange={(event) => {
          setAdmin(admins.find((item) => item.id === event.target.value) ?? null);
          if (!target) {
            changeSources([]);
            setSourceSearch("");
            setSourcePage(1);
          }
        }}>
          <option value="">{optionsLoading ? "Loading accounts…" : "Select an admin account"}</option>
          {admins.map((item) => <option key={item.id} value={item.id}>{item.username}{item.fullName ? ` — ${item.fullName}` : ""}</option>)}
        </select>
        <OptionPager page={adminPage} hasMore={options?.adminsHasMore ?? false} disabled={optionsLoading} onPage={setAdminPage} label="admin" />
        <p className="text-xs text-muted-foreground">Assignment controls shared report access. Each viewer keeps their own private TABLE B.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="osp-configured-source">2. Configured Saved source</Label>
        {target ? <p id="osp-configured-source" className="break-words rounded-md border bg-muted/20 p-3 text-sm">{target.activeRevision.sourceSnapshots.map((item) => `${item.name} (${item.filename || "Saved source"})`).join("; ")}<span className="mt-1 block text-xs text-muted-foreground">Frozen source — create a new target to use a different file or period.</span></p> : <>
          <Input aria-label="Search configured sources" value={sourceSearch} maxLength={120} placeholder="Search source name or filename" onChange={(event) => { setSourceSearch(event.target.value); setSourcePage(1); }} />
          <select id="osp-configured-source" aria-describedby="osp-configured-source-help" className={selectClass} value="" disabled={optionsLoading || !admin || selectedSources.length >= 5} onChange={(event) => {
            const source = sources.find((item) => item.id === event.target.value);
            if (source) changeSources(addBillingPrincipalSelectedSource(selectedSources, source));
          }}>
            <option value="">{optionsLoading ? "Loading sources…" : "Add a configured source"}</option>
            {sources.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.filename} · {item.validFrom} to {item.validTo}</option>)}
          </select>
          <p id="osp-configured-source-help" className="text-xs text-muted-foreground">Select up to 5 sources, one at a time. All must have the same configured validity. {selectedSources.length}/5 selected.</p>
          {selectedSources.length > 0 ? <ul aria-label="Selected configured sources" className="space-y-2">
            {selectedSources.map((item) => <li key={item.id} className="flex min-w-0 items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
              <div className="min-w-0 flex-1 break-words"><span className="font-medium">{item.name}</span><span className="block text-xs text-muted-foreground">{item.filename} · {item.validFrom} to {item.validTo}</span></div>
              <Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label={`Remove source ${item.name}`} onClick={() => changeSources(selectedSources.filter((selected) => selected.id !== item.id))}>Remove</Button>
            </li>)}
          </ul> : null}
          <OptionPager page={sourcePage} hasMore={options?.sourcesHasMore ?? false} disabled={optionsLoading} onPage={setSourcePage} label="source" />
          {!optionsLoading && options?.sources.length === 0 ? <p className="text-sm text-muted-foreground">No matching configured source. Configure Collection Source first, or change the search.</p> : null}
        </>}
      </div>
      {previewLoading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading authoritative Billing OSP baseline…</p> : null}
      {preview ? <section aria-label="Source validity and shared targets" className="min-w-0 space-y-3">
        <p className="rounded-md border bg-muted/20 p-3 text-sm">{!target || getBillingPrincipalReportingWindow(target.activeRevision).sourceValidityVerified ? "Current source validity" : "Reporting period (includes legacy source fallback)"}: <strong className="tabular-nums">{preview.from} — {preview.to}</strong><span className="mt-1 block text-xs text-muted-foreground">Read-only. Calendar follows the current Saved Collection Source validity.</span></p>
        <h3 className="text-sm font-medium">3. Shared TABLE A targets</h3>
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[490px]" aria-label="Shared target baseline preview">
            <TableHeader><TableRow><TableHead>Aging</TableHead><TableHead className="text-right">TT OSP</TableHead><TableHead className="text-right">Target %</TableHead><TableHead className="text-right">Target OSP</TableHead></TableRow></TableHeader>
            <TableBody>{BILLING_PRINCIPAL_AGINGS.map((aging) => {
              const totalOsp = preview.rows.find((row) => row.aging === aging)?.totalOsp;
              return <TableRow key={aging}><TableCell>{aging}</TableCell><TableCell className="text-right tabular-nums">{formatOspCurrency(totalOsp)}</TableCell><TableCell>
                <Input aria-label={`${aging} shared target percentage`} {...getAriaInvalidProps(Boolean(validation.percentageErrors[aging]))} aria-describedby={validation.percentageErrors[aging] ? `osp-target-${aging}-error` : undefined} className="ml-auto w-24 text-right tabular-nums" inputMode="decimal" value={percentages[aging]} maxLength={8} onChange={(event) => setPercentages((current) => ({ ...current, [aging]: event.target.value }))} />
                {validation.percentageErrors[aging] ? <p id={`osp-target-${aging}-error`} role="alert" className="mt-1 max-w-52 text-xs text-destructive">{validation.percentageErrors[aging]}</p> : null}
              </TableCell><TableCell className="text-right tabular-nums">{!validation.percentageErrors[aging] ? formatOspCurrency(calculateTargetOspPreview(totalOsp, percentages[aging])) : "—"}</TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">TT OSP uses Billing Principal only. Shared edits never overwrite saved private percentages.</p>
      </section> : null}
      <div className="space-y-2"><Label htmlFor="osp-target-name">4. Target name</Label><Input id="osp-target-name" required value={name} maxLength={120} {...getAriaInvalidProps(Boolean(validation.nameError))} aria-describedby={validation.nameError ? "osp-target-name-error" : undefined} onChange={(event) => setName(event.target.value)} />{validation.nameError ? <p id="osp-target-name-error" role="alert" className="text-xs text-destructive">{validation.nameError}</p> : null}</div>
      <div className="space-y-2"><Label htmlFor="osp-target-description">Description (optional)</Label><Textarea id="osp-target-description" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></div>
    </fieldset>
    {optionsError || previewError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{optionsError || previewError}</p><Button type="button" variant="outline" disabled={saving} onClick={() => setRetry((value) => value + 1)}>Retry loading</Button></div> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving || !preview || !admin || optionsLoading || Boolean(optionsError) || previewLoading || Boolean(previewError) || !sourcePreviewReady || !validation.valid}>{saving ? "Saving…" : "Save Target"}</Button></DialogFooter>
  </form>;
}

export function BillingPrincipalSavedTargetDialog({ target, onSaved, disabled = false, onOpenChange }: {
  target?: BillingPrincipalSavedTarget; onSaved: (target: BillingPrincipalSavedTarget) => void;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);
  return <Dialog open={open} onOpenChange={(value) => { if (!busy && (!value || !disabled)) setOpen(value); }}>
    <DialogTrigger asChild><Button type="button" disabled={disabled} variant={target ? "outline" : "default"}>{target ? <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> : <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />}{target ? "Edit Target" : "Create Target"}</Button></DialogTrigger>
    <DialogContent className="overflow-y-auto sm:max-w-3xl" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{target ? "Edit shared target" : "Create Billing OSP target"}</DialogTitle><DialogDescription>Select the assigned account, review the saved source and shared percentages, then save. Private TABLE B is not changed here.</DialogDescription></DialogHeader>
      {open ? <TargetForm target={target} onBusy={setBusy} onCancel={() => setOpen(false)} onSaved={(saved) => { setBusy(false); setOpen(false); onSaved(saved); }} /> : null}
    </DialogContent>
  </Dialog>;
}
