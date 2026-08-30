import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import type { CollectionSourceMatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatAmountRM } from "@/pages/collection/utils";
import { parseCollectionAmountToCents } from "@shared/collection-amount-types";

type CollectionSourceMatchFieldProps = {
  amount: string;
  disabled: boolean;
  error: string;
  fieldError?: string | undefined;
  hasSearched: boolean;
  loading: boolean;
  matches: CollectionSourceMatch[];
  onMatch: () => void;
  onSelect: (sourceImportId: string) => void;
  selectedImportId: string;
  selectedMatch: CollectionSourceMatch | null;
};

const MATCH_FIELD_LABELS = {
  customer_name: "Name",
  ic_number: "IC",
  customer_phone: "Phone",
  account_number: "Account",
} as const;

function getSourceLabel(match: CollectionSourceMatch) {
  return match.sourceImportName || match.sourceFilename || "Saved file";
}

function resolveCpStatus(amount: string, totalDue: string | null) {
  const amountCents = parseCollectionAmountToCents(amount);
  const totalDueCents = parseCollectionAmountToCents(totalDue, { allowZero: true });
  if (amountCents === null || totalDueCents === null) return null;
  return amountCents >= totalDueCents ? "Abort CP" : "CP";
}

export function CollectionSourceMatchField({
  amount,
  disabled,
  error,
  fieldError,
  hasSearched,
  loading,
  matches,
  onMatch,
  onSelect,
  selectedImportId,
  selectedMatch,
}: CollectionSourceMatchFieldProps) {
  const cpStatus = resolveCpStatus(amount, selectedMatch?.totalDue ?? null);
  const sourceMatchInvalidProps = getAriaInvalidProps(Boolean(fieldError));
  const validMatchCount = matches.filter((match) => match.totalDue !== null).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label htmlFor="save-collection-source-match">Verified Saved Source</Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sistem hanya senaraikan fail yang mempunyai baris customer sepadan. TOTAL DUE dan OSP dibaca oleh backend.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onMatch}
          disabled={disabled || loading}
          className="w-full shrink-0 sm:w-auto"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          {loading ? "Checking..." : "Semak Matching"}
        </Button>
      </div>

      <select
        id="save-collection-source-match"
        name="collectionSourceImport"
        value={selectedImportId}
        onChange={(event) => onSelect(event.target.value)}
        disabled={disabled || loading || validMatchCount === 0}
        required
        {...sourceMatchInvalidProps}
        aria-describedby={fieldError ? "save-collection-source-match-error" : undefined}
        className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">
          {loading ? "Checking Saved files..." : "Select a verified matching source"}
        </option>
        {matches.map((match) => (
          <option
            key={match.sourceImportId}
            value={match.sourceImportId}
            disabled={match.totalDue === null}
          >
            {getSourceLabel(match)} — {match.matchAccuracy}%{match.totalDue === null ? " (TOTAL DUE missing)" : ""}
          </option>
        ))}
      </select>

      {fieldError ? (
        <p id="save-collection-source-match-error" className="text-xs text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      ) : null}
      {hasSearched && matches.length === 0 && !error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p>Tiada baris Saved yang lulus padanan IC atau gabungan Phone + Account.</p>
        </div>
      ) : null}
      {hasSearched && matches.length > 0 && validMatchCount === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p>Padanan dijumpai, tetapi kolum TOTAL DUE tiada atau nilainya tidak sah.</p>
        </div>
      ) : null}

      {selectedMatch ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3" role="status">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="break-words text-sm font-semibold text-foreground">{getSourceLabel(selectedMatch)}</p>
                <p className="break-all text-xs text-muted-foreground">{selectedMatch.sourceFilename || "-"}</p>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Accuracy</dt>
                  <dd className="font-semibold">{selectedMatch.matchAccuracy}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">TOTAL DUE</dt>
                  <dd className="font-semibold">{selectedMatch.totalDue ? formatAmountRM(selectedMatch.totalDue) : "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Billing Principal (OSP)</dt>
                  <dd className="font-semibold">{selectedMatch.billingPrincipalOsp ? formatAmountRM(selectedMatch.billingPrincipalOsp) : "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">CP Status</dt>
                  <dd className={cn(
                    "font-semibold",
                    cpStatus === "Abort CP" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300",
                  )}>
                    {cpStatus || "Masukkan Amount"}
                  </dd>
                </div>
              </dl>
              <div className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Matched: {selectedMatch.matchedFields.map((field) => MATCH_FIELD_LABELS[field]).join(", ") || "-"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
