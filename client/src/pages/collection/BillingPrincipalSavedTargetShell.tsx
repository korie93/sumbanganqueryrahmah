import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, BookmarkPlus, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  createBillingPrincipalSavedTarget,
  deleteBillingPrincipalSavedTarget,
  listBillingPrincipalSavedTargets,
  prepareBillingPrincipalMutationAttempt,
  updateBillingPrincipalSavedTarget,
  type BillingPrincipalAging,
  type BillingPrincipalSavedTarget,
  type BillingPrincipalMutationAttempt,
  type BillingPrincipalTargetInput,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "@/pages/collection/utils";
import { BillingPrincipalSavedTargetWorkspace } from "./BillingPrincipalSavedTargetWorkspace";

export type BillingPrincipalSavedTargetDefaults = {
  sourceImportIds: string[];
  from: string;
  to: string;
  nicknameScope: string[];
  agingScope: BillingPrincipalAging[];
  targets: BillingPrincipalTargetInput[];
  ready: boolean;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function CreateSavedTargetDialog({
  defaults,
  disabled,
  onCreated,
}: {
  defaults: BillingPrincipalSavedTargetDefaults;
  disabled: boolean;
  onCreated: (target: BillingPrincipalSavedTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trackingStartDate, setTrackingStartDate] = useState(defaults.from);
  const [trackingEndDate, setTrackingEndDate] = useState(defaults.to);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const attemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setTrackingStartDate(defaults.from);
    setTrackingEndDate(defaults.to);
    setError("");
  }, [defaults.from, defaults.to, open]);

  const save = async () => {
    if (savingRef.current) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Target name is required.");
      return;
    }
    if (!trackingStartDate || trackingStartDate < defaults.from || trackingStartDate > defaults.to) {
      setError("Tracking start must be inside the target period.");
      return;
    }
    if (trackingEndDate && (trackingEndDate < trackingStartDate || trackingEndDate > defaults.to)) {
      setError("Tracking end must be on or after tracking start and inside the target period.");
      return;
    }

    const payload = {
      name: normalizedName,
      description: nullableText(description),
      sourceImportIds: defaults.sourceImportIds,
      from: defaults.from,
      to: defaults.to,
      trackingStartDate,
      trackingEndDate: trackingEndDate || null,
      nicknameScope: defaults.nicknameScope,
      agingScope: defaults.agingScope,
      targets: defaults.targets,
    };
    const attempt = prepareBillingPrincipalMutationAttempt(
      "saved-target:create",
      payload,
      attemptRef.current,
    );
    attemptRef.current = attempt;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await createBillingPrincipalSavedTarget(payload, attempt);
      attemptRef.current = null;
      setOpen(false);
      onCreated(response.target);
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
        <Button type="button" disabled={disabled}>
          <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          Save Current Target
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Saved Target</DialogTitle>
          <DialogDescription>
            Freeze the current source, date, nickname, aging, baseline, and target settings as an immutable revision.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="billing-saved-target-name">Target name</Label>
            <Input
              id="billing-saved-target-name"
              value={name}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="billing-saved-target-description">Description (optional)</Label>
            <Textarea
              id="billing-saved-target-description"
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billing-tracking-start">Tracking start</Label>
            <Input
              id="billing-tracking-start"
              type="date"
              value={trackingStartDate}
              min={defaults.from}
              max={trackingEndDate || defaults.to}
              onChange={(event) => setTrackingStartDate(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billing-tracking-end">Tracking end (optional)</Label>
            <Input
              id="billing-tracking-end"
              type="date"
              value={trackingEndDate}
              min={trackingStartDate || defaults.from}
              max={defaults.to}
              onChange={(event) => setTrackingEndDate(event.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
          {defaults.sourceImportIds.length} source{defaults.sourceImportIds.length === 1 ? "" : "s"} · {defaults.from} to {defaults.to} · {defaults.agingScope.join(", ")}
        </div>
        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Creating..." : "Create Target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSavedTargetDialog({
  target,
  onUpdated,
}: {
  target: BillingPrincipalSavedTarget;
  onUpdated: (target: BillingPrincipalSavedTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(target.name);
  const [description, setDescription] = useState(target.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const attemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(target.name);
    setDescription(target.description || "");
    setError("");
  }, [open, target.description, target.name]);

  const save = async () => {
    if (savingRef.current) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Target name is required.");
      return;
    }
    const payload = {
      name: normalizedName,
      description: nullableText(description),
      version: target.version,
    };
    const attempt = prepareBillingPrincipalMutationAttempt(
      "saved-target:update",
      { targetId: target.id, payload },
      attemptRef.current,
    );
    attemptRef.current = attempt;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await updateBillingPrincipalSavedTarget(
        target.id,
        payload,
        attempt,
      );
      attemptRef.current = null;
      setOpen(false);
      onUpdated(response.target);
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
        <Button type="button" variant="outline">
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit Target
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Saved Target</DialogTitle>
          <DialogDescription>
            Update display metadata only. The source, period, baseline, and target revision remain immutable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="billing-edit-target-name">Target name</Label>
            <Input
              id="billing-edit-target-name"
              value={name}
              maxLength={120}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billing-edit-target-description">Description (optional)</Label>
            <Textarea
              id="billing-edit-target-description"
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
          </div>
          <p className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
            Revision {target.activeRevision.revisionNumber} remains unchanged.
          </p>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Saving..." : "Save Metadata"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BillingPrincipalSavedTargetShell({
  role,
  defaults,
  children,
}: {
  role: string;
  defaults: BillingPrincipalSavedTargetDefaults;
  children: ReactNode;
}) {
  const [targets, setTargets] = useState<BillingPrincipalSavedTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const deletingRef = useRef(false);
  const deleteAttemptRef = useRef<BillingPrincipalMutationAttempt | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listBillingPrincipalSavedTargets({ signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const activeTargets = response.targets.filter((target) => target.status === "ACTIVE");
        setTargets(activeTargets);
        setSelectedTargetId((current) => (
          activeTargets.some((target) => target.id === current) ? current : ""
        ));
      })
      .catch((caught) => {
        if (!controller.signal.aborted && !isAbortError(caught)) {
          setError(parseApiError(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadVersion, role]);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) || null,
    [selectedTargetId, targets],
  );

  const deleteTarget = async () => {
    if (!selectedTarget || deletingRef.current) return;
    const attempt = prepareBillingPrincipalMutationAttempt(
      "saved-target:delete",
      { targetId: selectedTarget.id, version: selectedTarget.version },
      deleteAttemptRef.current,
    );
    deleteAttemptRef.current = attempt;
    deletingRef.current = true;
    setDeleting(true);
    setError("");
    try {
      await deleteBillingPrincipalSavedTarget(
        selectedTarget.id,
        selectedTarget.version,
        attempt,
      );
      deleteAttemptRef.current = null;
      setDeleteOpen(false);
      setSelectedTargetId("");
      setReloadVersion((value) => value + 1);
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section aria-labelledby="billing-target-workspace-heading" className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="billing-target-workspace-heading" className="font-semibold">Billing Principal Workspace</h2>
              <Badge variant={selectedTarget ? "default" : "outline"} className="rounded-full">
                {selectedTarget ? `Revision ${selectedTarget.activeRevision.revisionNumber}` : "Legacy live view"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a saved target for governed System, Client, Table C, and Reconciled reporting.
            </p>
            <Label htmlFor="billing-saved-target-select" className="mt-3 block">Saved target</Label>
            <select
              id="billing-saved-target-select"
              className="mt-1.5 min-h-11 w-full max-w-xl rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-9"
              value={selectedTargetId}
              onChange={(event) => setSelectedTargetId(event.target.value)}
              disabled={loading && targets.length === 0}
            >
              <option value="">Legacy live view (unsaved filters)</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name} · rev {target.activeRevision.revisionNumber}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadVersion((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Reload Targets
            </Button>
            {role === "superuser" ? (
              <CreateSavedTargetDialog
                defaults={defaults}
                disabled={!defaults.ready}
                onCreated={(target) => {
                  setTargets((current) => [target, ...current.filter((item) => item.id !== target.id)]);
                  setSelectedTargetId(target.id);
                  setReloadVersion((value) => value + 1);
                }}
              />
            ) : null}
            {role === "superuser" && selectedTarget ? (
              <>
                <EditSavedTargetDialog
                  target={selectedTarget}
                  onUpdated={(target) => {
                    setTargets((current) => current.map((item) => item.id === target.id ? target : item));
                  }}
                />
                <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)} disabled={deleting}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete Target
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {error ? (
          <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      {selectedTarget ? (
        <BillingPrincipalSavedTargetWorkspace key={selectedTarget.id} role={role} target={selectedTarget} />
      ) : children}

      <AlertDialog open={deleteOpen} onOpenChange={(nextOpen) => !deleting && setDeleteOpen(nextOpen)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved target?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedTarget?.name || "This target"} will be soft-deleted. Its immutable revisions and audit records remain retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteTarget();
              }}
            >
              {deleting ? "Deleting..." : "Delete Target"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
