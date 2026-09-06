import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatOperationalDateTime, parseDateValue } from "@/lib/date-format";
import {
  deleteBillingPrincipalSavedTarget, getBillingPrincipalSavedTarget, listBillingPrincipalSavedTargets,
  prepareBillingPrincipalMutationAttempt, type BillingPrincipalSavedTarget, type BillingPrincipalMutationAttempt,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "./utils";
import { BillingPrincipalSavedTargetDialog } from "./BillingPrincipalSavedTargetDialog";
import { BillingPrincipalSavedTargetWorkspace, billingPrincipalWorkspaceLockMessage, type BillingPrincipalWorkspaceInteraction } from "./BillingPrincipalSavedTargetWorkspace";

export function BillingPrincipalSavedTargetUpdatedAt({ value }: { value: string }) {
  const parsed = parseDateValue(value);
  return <p className="text-xs text-muted-foreground">Last updated: {parsed
    ? <time className="tabular-nums" dateTime={parsed.toISOString()}>{formatOperationalDateTime(parsed)} MYT (UTC+08:00)</time>
    : "Unavailable"}</p>;
}

export function BillingPrincipalSavedTargetShell({ role }: { role: string }) {
  const [targets, setTargets] = useState<BillingPrincipalSavedTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [interaction, setInteraction] = useState<(BillingPrincipalWorkspaceInteraction & { workspaceKey: string }) | null>(null);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const deleteAttemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  const deleteControllerRef = useRef<AbortController | null>(null);
  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? null;
  const workspaceKey = selectedTarget ? `${selectedTarget.id}:${selectedTarget.activeRevision.id}:${selectedTarget.version}` : "";
  const interactionMessage = interaction?.workspaceKey === workspaceKey ? billingPrincipalWorkspaceLockMessage(interaction) : "";
  const workspaceLocked = Boolean(interactionMessage);
  const controlsLocked = loading || deleting || configOpen || workspaceLocked;
  const handleInteractionChange = useCallback((state: BillingPrincipalWorkspaceInteraction) => {
    setInteraction({ ...state, workspaceKey });
  }, [workspaceKey]);

  useEffect(() => () => deleteControllerRef.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setTargets([]); setHasMore(false); setError("");
    void listBillingPrincipalSavedTargets({ page, pageSize: 50, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setTargets(response.targets); setHasMore(response.hasMore);
        setSelectedTargetId((current) => response.targets.some((target) => target.id === current) ? current : response.targets[0]?.id ?? "");
      })
      .catch((caught: unknown) => { if (!controller.signal.aborted) { setSelectedTargetId(""); setError(parseApiError(caught)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, reloadVersion, role]);

  useEffect(() => {
    if (!selectedTarget) return;
    let controller: AbortController | null = null;
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      const request = new AbortController(); controller = request;
      void getBillingPrincipalSavedTarget(selectedTarget.id, { signal: request.signal })
        .then(({ target }) => {
          if (request.signal.aborted) return;
          // Keep a live private draft or operation mounted. Access errors below
          // still clear immediately; successful metadata updates can wait.
          if (!workspaceLocked && !configOpen && !deleting && target.version !== selectedTarget.version) {
            setTargets((current) => current.map((item) => item.id === target.id ? target : item));
          }
        })
        .catch((caught: unknown) => {
          if (request.signal.aborted) return;
          // Unmount private/PII state whenever live access cannot be established.
          setTargets([]); setSelectedTargetId(""); setError(parseApiError(caught));
        });
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    // Apply deferred shared changes only after fresh authorization, once idle.
    if (!workspaceLocked && !configOpen && !deleting) revalidate();
    return () => { controller?.abort(); window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, [configOpen, deleting, selectedTarget, workspaceLocked]);

  const deleteTarget = async () => {
    if (!selectedTarget || deleteControllerRef.current || workspaceLocked || configOpen) return;
    const attempt = prepareBillingPrincipalMutationAttempt("saved-target:delete", { targetId: selectedTarget.id, version: selectedTarget.version }, deleteAttemptRef.current);
    deleteAttemptRef.current = attempt;
    const controller = new AbortController(); deleteControllerRef.current = controller;
    setDeleting(true); setError("");
    try {
      await deleteBillingPrincipalSavedTarget(selectedTarget.id, selectedTarget.version, { ...attempt, signal: controller.signal });
      if (controller.signal.aborted) return;
      deleteAttemptRef.current = null; setDeleteOpen(false); setSelectedTargetId("");
      setPage(1); setReloadVersion((value) => value + 1);
    } catch (caught) {
      if (!controller.signal.aborted) setError(parseApiError(caught));
    } finally {
      if (!controller.signal.aborted) { deleteControllerRef.current = null; setDeleting(false); }
    }
  };

  return <div className="min-w-0 space-y-5" data-testid="billing-principal-page" data-state={loading ? "loading" : error ? "error" : selectedTarget ? "populated" : "empty"}>
    <section aria-labelledby="billing-target-workspace-heading" className="rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <h2 id="billing-target-workspace-heading" className="font-semibold">Billing Principal (OSP)</h2>
          <p className="mt-1 text-sm text-muted-foreground">Shared system targets and your private client results.</p>
          <Label htmlFor="billing-saved-target-select" className="mt-3 block">Saved target</Label>
          <select id="billing-saved-target-select" className="mt-1.5 min-h-10 w-full max-w-2xl rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={selectedTargetId} onChange={(event) => { if (!controlsLocked) setSelectedTargetId(event.target.value); }} disabled={controlsLocked} aria-describedby={workspaceLocked ? "billing-workspace-lock-guidance" : undefined}>
            <option value="" disabled>Select a saved target</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.name} — {target.assignedAdmin?.username ?? "Unassigned (legacy)"}</option>)}
          </select>
          {page > 1 || hasMore ? <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <Button type="button" size="sm" variant="ghost" disabled={controlsLocked || page === 1} onClick={() => { if (!controlsLocked) setPage((value) => value - 1); }}>Previous targets</Button>
            <span>Page {page}</span><Button type="button" size="sm" variant="ghost" disabled={controlsLocked || !hasMore} onClick={() => { if (!controlsLocked) setPage((value) => value + 1); }}>Next targets</Button>
          </div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { if (!controlsLocked) setReloadVersion((value) => value + 1); }} disabled={controlsLocked}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Reload Targets</Button>
          {role === "superuser" ? <BillingPrincipalSavedTargetDialog disabled={controlsLocked} onOpenChange={setConfigOpen} onSaved={(target) => { setSelectedTargetId(target.id); setPage(1); setReloadVersion((value) => value + 1); }} /> : null}
          {role === "superuser" && selectedTarget && !deleting ? <>
            <BillingPrincipalSavedTargetDialog key={selectedTarget.id + ":" + selectedTarget.version} target={selectedTarget} disabled={controlsLocked} onOpenChange={setConfigOpen} onSaved={(target) => setTargets((current) => current.map((item) => item.id === target.id ? target : item))} />
            <Button type="button" variant="outline" disabled={controlsLocked} onClick={() => { if (!controlsLocked) setDeleteOpen(true); }}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Delete Target</Button>
          </> : null}
        </div>
      </div>
      {interactionMessage ? <p id="billing-workspace-lock-guidance" role="status" className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">{interactionMessage}</p> : null}
      {selectedTarget ? <div className="mt-4 space-y-2 border-t pt-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{selectedTarget.assignedAdmin ? "Admin: " + selectedTarget.assignedAdmin.username : "Legacy — no assigned admin"}</Badge><span className="tabular-nums text-muted-foreground">{selectedTarget.activeRevision.from} — {selectedTarget.activeRevision.to}</span></div>
        <p className="break-words text-muted-foreground">{selectedTarget.activeRevision.sourceSnapshots.map((source) => source.name + " · " + (source.filename || "Saved source")).join("; ")}</p>
        <BillingPrincipalSavedTargetUpdatedAt value={selectedTarget.updatedAt} />
        {!selectedTarget.activeRevision.sourceValidityVerified ? <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">Legacy saved period: configured source validity was not recorded by this version. Historical dates and balances are retained. A superuser can create a new target from Configure Collection Source for a verified period.</p> : null}
        {selectedTarget.description ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{selectedTarget.description}</p> : null}
      </div> : null}
      {error ? <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    </section>
    {loading ? <div role="status" className="flex min-h-40 items-center justify-center gap-2 rounded-xl border bg-card text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading saved targets…</div>
      : selectedTarget ? <BillingPrincipalSavedTargetWorkspace key={workspaceKey} role={role} target={selectedTarget} onInteractionChange={handleInteractionChange} />
        : <div className="rounded-xl border border-dashed bg-card p-6 text-center"><p className="font-medium">No saved target is available.</p><p className="mt-1 text-sm text-muted-foreground">{role === "superuser" ? "Create a target using an admin account and configured Saved source." : "A superuser can create or assign a target for this account."}</p></div>}
    <AlertDialog open={deleteOpen} onOpenChange={(value) => { if (!deleting) setDeleteOpen(value); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete saved target?</AlertDialogTitle><AlertDialogDescription>{selectedTarget?.name ?? "This target"} will be deactivated. Source files, Collection records, private results and audit history are retained.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting || workspaceLocked || configOpen} onClick={(event) => { event.preventDefault(); void deleteTarget(); }}>{deleting ? "Deleting…" : "Delete Target"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
