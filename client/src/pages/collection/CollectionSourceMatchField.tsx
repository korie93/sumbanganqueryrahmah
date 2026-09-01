import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionSourceMatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCollectionSourceMatchedFields, getCollectionSourceLabel } from "@/pages/collection/collection-source-match-diagnostics";
import { formatAmountRM } from "@/pages/collection/utils";

type CollectionSourceMatchFieldProps = {
  disabled: boolean;
  error: string;
  hasSearched: boolean;
  loading: boolean;
  matches: CollectionSourceMatch[];
  onMatch: () => void;
  selectedMatch: CollectionSourceMatch | null;
};

function formatDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function getMatchingState(error: string, hasSearched: boolean, matches: CollectionSourceMatch[]) {
  if (!hasSearched || matches.length > 0) return null;
  const lower = error.toLowerCase();
  if (lower.includes("masterlisting") || lower.includes("not configured")) return "no-config";
  if (lower.includes("more than one") || lower.includes("ambigu")) return "ambiguous";
  return "no-match";
}

export function CollectionSourceMatchField({
  disabled,
  error,
  hasSearched,
  loading,
  matches,
  onMatch,
  selectedMatch,
}: CollectionSourceMatchFieldProps) {
  const matchingState = getMatchingState(error, hasSearched, matches);
  const cpStatusLabel = selectedMatch?.projectedCpStatus === "abort_cp" ? "Abort CP" : "CP";

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium leading-none">Auto-matching Saved</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sistem akan semak Saved source aktif menggunakan Account/Card, Payment Date, dan Amount.
            Sumber, Aging, Calling Date, TOTAL DUE, dan OSP ditentukan oleh backend.
          </p>
        </div>
        <Button
          id="save-collection-source-match-action"
          type="button"
          variant="outline"
          onClick={onMatch}
          disabled={disabled || loading}
          aria-describedby={error ? "save-collection-source-match-action-error" : undefined}
          className="w-full shrink-0 sm:w-auto"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          {loading ? "Checking..." : "Semak Auto-matching"}
        </Button>
      </div>

      {error ? (
        <div
          id="save-collection-source-match-action-error"
          className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <p className="min-w-0 break-words">{error}</p>
        </div>
      ) : null}

      {matchingState === "no-config" ? (
        <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
          Tiada source Saved aktif untuk Payment Date ini. Minta superuser konfigurasi source terlebih dahulu.
        </p>
      ) : null}
      {matchingState === "ambiguous" ? (
        <p className="rounded-lg border border-destructive/35 bg-destructive/5 p-3 text-sm text-destructive">
          Lebih daripada satu source atau rekod sepadan. Simpanan dihentikan sehingga superuser membetulkan ambiguity.
        </p>
      ) : null}
      {matchingState === "no-match" ? (
        <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
          Tiada rekod Saved sepadan. Semak semula identity, Account/Card Number, Payment Date, dan Amount.
        </p>
      ) : null}

      {selectedMatch ? (
        <div className="min-w-0 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3" role="status" aria-live="polite">
          <div className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">{getCollectionSourceLabel(selectedMatch)}</p>
                <p className="break-all text-xs text-muted-foreground">{selectedMatch.sourceFilename || "-"}</p>
              </div>
              <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2">
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Aging</dt>
                  <dd className="break-words font-semibold">{selectedMatch.agingBucket || "-"}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Calling Date Window</dt>
                  <dd className="break-words font-semibold">
                    {formatDateOnly(selectedMatch.callingDate)} – {formatDateOnly(selectedMatch.callingWindowEnd)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">TOTAL DUE</dt>
                  <dd className="break-words font-semibold">
                    {selectedMatch.totalDue === null ? "-" : formatAmountRM(selectedMatch.totalDue)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Billing Principal (OSP)</dt>
                  <dd className="break-words font-semibold">
                    {selectedMatch.billingPrincipalOsp === null ? "-" : formatAmountRM(selectedMatch.billingPrincipalOsp)}
                  </dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Current Entry</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.currentEntry)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Existing Cumulative</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.existingCumulative)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Projected Cumulative</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.projectedCumulative)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Remaining After Save</dt>
                  <dd className="break-words font-semibold">{formatAmountRM(selectedMatch.remainingAfterSave)}</dd>
                </div>
                <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                  <dt className="text-xs text-muted-foreground">Result</dt>
                  <dd className={cn(
                    "break-words font-semibold",
                    selectedMatch.projectedTotalDueCovered
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-amber-700 dark:text-amber-300",
                  )}>
                    {cpStatusLabel}
                  </dd>
                </div>
                {selectedMatch.cardNumberLast4 ? (
                  <div className="min-w-0 rounded-lg border border-border/60 bg-background/70 p-2.5">
                    <dt className="text-xs text-muted-foreground">Matched Card</dt>
                    <dd className="break-words font-semibold">**** {selectedMatch.cardNumberLast4}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
                <span className="break-words">Matched: {formatCollectionSourceMatchedFields(selectedMatch)}</span>
                <span>Accuracy: {selectedMatch.matchAccuracy}% · Server-authoritative</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
