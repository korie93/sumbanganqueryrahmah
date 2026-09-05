import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
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
  updateBillingPrincipalTargets,
  type BillingPrincipalReportRow,
  type BillingPrincipalTargetInput,
} from "@/lib/api/collection-billing-principal";
import { parseApiError } from "@/pages/collection/utils";
import {
  BILLING_PRINCIPAL_AGINGS,
  calculateTargetOspPreview,
  formatOspCurrency,
} from "./billing-principal-report-utils";

export type BillingPrincipalTargetDraft = Record<string, { percentage: string }>;

export function buildBillingPrincipalTargetDraft(
  rows: BillingPrincipalReportRow[],
): BillingPrincipalTargetDraft {
  return Object.fromEntries(BILLING_PRINCIPAL_AGINGS.map((aging) => {
    const row = rows.find((candidate) => candidate.aging === aging);
    return [aging, {
      percentage: row?.targetPercentage || "0.0000",
    }];
  }));
}

export function buildBillingPrincipalTargetMutationRows(
  rows: BillingPrincipalReportRow[],
  draft: BillingPrincipalTargetDraft,
): BillingPrincipalTargetInput[] {
  return BILLING_PRINCIPAL_AGINGS.map((aging) => {
    const authoritativeRow = rows.find((candidate) => candidate.aging === aging);
    return {
      agingBucket: aging,
      // This is an integrity assertion from the server-provided Saved Target,
      // never a user-editable source of financial truth.
      totalOspBaseline: authoritativeRow?.totalOsp || null,
      targetPercentage: draft[aging]?.percentage.trim() || "0",
    };
  });
}

export function validateBillingPrincipalTargetDraft(
  draft: BillingPrincipalTargetDraft,
): string {
  for (const aging of BILLING_PRINCIPAL_AGINGS) {
    const row = draft[aging];
    const percentage = Number(String(row?.percentage || "").replace(/%/g, ""));
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return `${aging} Target % must be between 0 and 100.`;
    }
  }
  return "";
}

export function BillingPrincipalTargetDialog({
  rows,
  sourceImportIds,
  from,
  to,
  disabled,
  onSaved,
}: {
  rows: BillingPrincipalReportRow[];
  sourceImportIds: string[];
  from: string;
  to: string;
  disabled?: boolean | undefined;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BillingPrincipalTargetDraft>(
    () => buildBillingPrincipalTargetDraft(rows),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    saveControllerRef.current?.abort();
    saveControllerRef.current = null;
  }, []);

  useEffect(() => {
    if (open) {
      setDraft(buildBillingPrincipalTargetDraft(rows));
      setError("");
    }
  }, [open, rows]);

  const updateDraft = (aging: string, value: string) => {
    setDraft((current) => ({
      ...current,
      [aging]: {
        percentage: value,
      },
    }));
  };

  const save = async () => {
    const validationError = validateBillingPrincipalTargetDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const targets = buildBillingPrincipalTargetMutationRows(rows, draft);
    saveControllerRef.current?.abort();
    const controller = new AbortController();
    saveControllerRef.current = controller;
    setSaving(true);
    setError("");
    try {
      await updateBillingPrincipalTargets(
        { sourceImportIds, from, to, targets },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setOpen(false);
      onSaved();
    } catch (caught) {
      if (
        !controller.signal.aborted
        && !(caught instanceof Error && caught.name === "AbortError")
      ) {
        setError(parseApiError(caught));
      }
    } finally {
      if (saveControllerRef.current === controller) {
        saveControllerRef.current = null;
        if (!controller.signal.aborted) setSaving(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Configure Targets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Billing Principal (OSP) Targets</DialogTitle>
          <DialogDescription>
            Configure Target % for this exact date and source-file scope. TT OSP comes from
            the immutable Saved Target snapshot and Target OSP is calculated automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {BILLING_PRINCIPAL_AGINGS.map((aging) => {
            const values = draft[aging] || { percentage: "" };
            const authoritativeRow = rows.find((candidate) => candidate.aging === aging);
            const baseline = authoritativeRow?.totalOsp || "";
            return (
              <fieldset key={aging} className="min-w-0 space-y-3 rounded-xl border border-border/70 p-4">
                <legend className="px-1 text-sm font-semibold">{aging}</legend>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">TT OSP (Saved Target)</p>
                  <p className="tabular-nums" data-testid={`osp-baseline-${aging}`}>
                    {formatOspCurrency(baseline)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`osp-percentage-${aging}`}>Target %</Label>
                  <Input
                    id={`osp-percentage-${aging}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={values.percentage}
                    onChange={(event) => updateDraft(aging, event.target.value)}
                    disabled={saving}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Target OSP: {formatOspCurrency(
                    calculateTargetOspPreview(baseline, values.percentage),
                  )}
                </p>
              </fieldset>
            );
          })}
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
            {saving ? "Saving..." : "Save Targets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
