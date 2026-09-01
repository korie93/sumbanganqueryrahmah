import { useState } from "react";
import { CalendarRange, Database, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  CollectionSourceConfig,
  CollectionSourceConfigInput,
} from "@/lib/api/collection-source-configs";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import {
  getSavedSourceCompatibilityMessage,
  savedSourceStatusPresentation,
} from "@/pages/saved/saved-source-config-utils";
import type { ImportItem } from "@/pages/saved/types";

type SavedSourceConfigDialogProps = {
  config: CollectionSourceConfig | null;
  form: CollectionSourceConfigInput;
  formError: string;
  importItem: ImportItem | null;
  mutationPending: "save" | "delete" | null;
  open: boolean;
  onDelete: () => Promise<void>;
  onFormChange: (patch: Partial<CollectionSourceConfigInput>) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => Promise<void>;
};

function SourceConfigStatus({ config }: { config: CollectionSourceConfig | null }) {
  const status = config ? savedSourceStatusPresentation[config.status] : null;
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/25 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
          Source status
        </span>
        <span className={cn(
          badgeVariants({ variant: "outline" }),
          status?.toneClassName ?? "border-border bg-background text-muted-foreground",
        )}>
          {status?.label ?? "Not configured"}
        </span>
        <span className={cn(
          badgeVariants({ variant: "outline" }),
          config?.compatibilityStatus === "compatible"
            ? "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200"
            : "border-border text-muted-foreground",
        )}>
          {config?.compatibilityStatus === "compatible" ? "Compatible" : "Compatibility pending"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {getSavedSourceCompatibilityMessage(config)}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-4 w-4" aria-hidden="true" />
        {config
          ? `${config.indexedRowCount.toLocaleString()} of ${config.rowCount.toLocaleString()} rows indexed`
          : "No rows indexed yet"}
      </div>
    </div>
  );
}

export function SavedSourceConfigDialog({
  config,
  form,
  formError,
  importItem,
  mutationPending,
  onDelete,
  onFormChange,
  onOpenChange,
  onSave,
  open,
}: SavedSourceConfigDialogProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const busy = mutationPending !== null;
  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    if (!nextOpen) setDeleteConfirmOpen(false);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="gap-5 sm:max-w-xl"
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
        onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Configure Collection Source</DialogTitle>
          <DialogDescription>
            Set when this Saved file may be used for Collection matching. Saving also validates and indexes its required fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-background p-3">
            <p className="break-words text-sm font-medium text-foreground">
              {importItem?.name ?? "Selected Saved file"}
            </p>
            {importItem?.filename ? (
              <p className="mt-1 break-words text-xs text-muted-foreground">{importItem.filename}</p>
            ) : null}
          </div>

          <SourceConfigStatus config={config} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="saved-source-valid-from">Valid from</Label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="saved-source-valid-from"
                  type="date"
                  value={form.validFrom}
                  max={form.validTo || undefined}
                  onChange={(event) => onFormChange({ validFrom: event.target.value })}
                  aria-describedby={formError ? "saved-source-config-error" : undefined}
                  {...getAriaInvalidProps(Boolean(formError))}
                  className="h-11 pl-9"
                  disabled={busy}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="saved-source-valid-to">Valid to</Label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="saved-source-valid-to"
                  type="date"
                  value={form.validTo}
                  min={form.validFrom || undefined}
                  onChange={(event) => onFormChange({ validTo: event.target.value })}
                  aria-describedby={formError ? "saved-source-config-error" : undefined}
                  {...getAriaInvalidProps(Boolean(formError))}
                  className="h-11 pl-9"
                  disabled={busy}
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-muted/25 p-3">
            <div className="space-y-1">
              <Label htmlFor="saved-source-enabled">Enable for matching</Label>
              <p id="saved-source-enabled-help" className="text-xs text-muted-foreground">
                An incompatible file remains unavailable even when enabled.
              </p>
            </div>
            <Switch
              id="saved-source-enabled"
              checked={form.enabled}
              onCheckedChange={(checked) => onFormChange({ enabled: checked })}
              aria-describedby="saved-source-enabled-help"
              disabled={busy}
            />
          </div>

          {formError ? (
            <p id="saved-source-config-error" role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {formError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:flex-row sm:justify-between sm:space-x-0">
          {config ? (
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full text-destructive sm:w-auto" disabled={busy}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Remove configuration
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="gap-5 sm:max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Collection source?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Matching and report access through this source will stop until it is configured again. The Saved file itself is not deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void onDelete()}
                    disabled={busy}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove configuration
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span aria-hidden="true" />}
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void onSave()}
              disabled={busy || !form.validFrom || !form.validTo}
            >
              {mutationPending === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {mutationPending === "save" ? "Saving..." : "Save configuration"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
