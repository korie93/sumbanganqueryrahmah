import { AlertCircle, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BillingPrincipalTargetDialog } from "./BillingPrincipalTargetDialog";
import { BillingPrincipalSavedTargetShell } from "./BillingPrincipalSavedTargetShell";
import {
  BILLING_PRINCIPAL_AGINGS,
  buildBillingPrincipalSavedTargetRows,
  filterBillingPrincipalRows,
  formatOspCurrency,
  formatOspPercentage,
} from "./billing-principal-report-utils";
import { useBillingPrincipalReport } from "./useBillingPrincipalReport";

function SourceStatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge variant={status === "active" ? "default" : "outline"} className="shrink-0 rounded-full">
      {label}
    </Badge>
  );
}

export default function BillingPrincipalReportPage({ role }: { role: string }) {
  const state = useBillingPrincipalReport();
  const visibleRows = state.report
    ? filterBillingPrincipalRows(state.report.rows, state.selectedAgings)
    : [];
  const sourceSelectionFull = state.selectedSourceIds.length >= 5;

  const legacyView = (
    <OperationalSectionCard
      title="Billing Principal (OSP)"
      description="TT OSP comes from the trusted Billing Principal field. OSP CLOSED counts only the sole Abort CP event for each logical account."
      badge={(
        <Badge variant="secondary" className="rounded-full">
          Abort CP only
        </Badge>
      )}
      actions={(
        <div className="flex flex-wrap gap-2">
          {role === "superuser" && state.report ? (
            <BillingPrincipalTargetDialog
              rows={state.report.rows}
              sourceImportIds={state.selectedSourceIds}
              from={state.from}
              to={state.to}
              disabled={state.loadingReport || state.selectedSourceIds.length < 1}
              onSaved={state.refresh}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={state.refresh}
            disabled={state.loadingOptions || state.loadingReport || state.selectedSourceIds.length < 1}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${state.loadingReport ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>
      )}
      contentClassName="space-y-5"
    >
      <section aria-labelledby="billing-principal-filters" className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="billing-principal-filters" className="font-semibold">Report Filters</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Select 1–5 configured Saved files. Matching and calculations remain server-side.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full">
            {state.selectedSourceIds.length}/5 sources
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="billing-principal-from">Date From</Label>
            <Input
              id="billing-principal-from"
              type="date"
              value={state.from}
              max={state.to || undefined}
              onChange={(event) => state.setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billing-principal-to">Date To</Label>
            <Input
              id="billing-principal-to"
              type="date"
              value={state.to}
              min={state.from || undefined}
              onChange={(event) => state.setTo(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billing-principal-nickname">Nickname</Label>
            <select
              id="billing-principal-nickname"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-9"
              value={state.selectedNickname}
              onChange={(event) => state.setSelectedNickname(event.target.value)}
            >
              <option value="">All permitted nicknames</option>
              {state.nicknames.map((nickname) => (
                <option key={nickname.id} value={nickname.nickname}>{nickname.nickname}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Source File</legend>
          {state.loadingOptions ? (
            <p className="text-sm text-muted-foreground">Loading configured Saved sources...</p>
          ) : state.sourceConfigs.length === 0 ? (
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
              <p>No compatible Collection source is configured. Ask superuser to configure one in Saved.</p>
            </div>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {state.sourceConfigs.map((source) => {
                const checked = state.selectedSourceIds.includes(source.sourceImportId);
                const disabled = !checked && sourceSelectionFull;
                const inputId = `billing-source-${source.sourceImportId}`;
                return (
                  <label
                    key={source.sourceImportId}
                    htmlFor={inputId}
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-background p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => state.toggleSource(source.sourceImportId)}
                      aria-label={`Select ${source.sourceFilename || source.sourceImportName}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="break-all text-sm font-medium">
                          {source.sourceFilename || source.sourceImportName}
                        </span>
                        <SourceStatusBadge status={source.status} />
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {source.indexedRowCount.toLocaleString()} indexed rows · {source.validFrom} to {source.validTo}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <section className="space-y-2" aria-labelledby="billing-aging-scope-heading">
          <h3 id="billing-aging-scope-heading" className="text-sm font-medium">Aging (DC_STS)</h3>
          <div className="flex flex-wrap gap-2" aria-label="Fixed Saved Target aging rows">
            {BILLING_PRINCIPAL_AGINGS.map((aging) => (
              <Badge key={aging} variant="outline" className="min-h-8 rounded-full px-3">
                {aging}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Every Saved Target includes D3, D4, D5, and D6 so Table A and Table B always share one complete baseline.
          </p>
        </section>
      </section>

      {state.optionsError || state.reportError ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{state.optionsError || state.reportError}</p>
        </div>
      ) : null}

      {state.report ? (
        <>
          <OperationalSummaryStrip className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OperationalMetric label="TT OSP" value={formatOspCurrency(state.report.all.totalOsp)} supporting="Selected source baseline" />
            <OperationalMetric label="Target OSP" value={formatOspCurrency(state.report.all.targetOsp)} supporting={`${formatOspPercentage(state.report.all.targetPercentage)} weighted target`} />
            <OperationalMetric label="OSP CLOSED" value={formatOspCurrency(state.report.all.ospClosed)} supporting={`${state.report.all.closedAccountCount.toLocaleString()} unique Abort CP accounts`} tone="success" />
            <OperationalMetric label="Result" value={formatOspPercentage(state.report.all.resultPercentage)} supporting="OSP CLOSED ÷ TT OSP" />
          </OperationalSummaryStrip>

          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table aria-label="Billing Principal OSP performance by aging" className="min-w-[820px]">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Aging</TableHead>
                  <TableHead className="text-right">TT OSP</TableHead>
                  <TableHead className="text-right">Target %</TableHead>
                  <TableHead className="text-right">Target OSP</TableHead>
                  <TableHead className="text-right">Result %</TableHead>
                  <TableHead className="text-right">OSP CLOSED</TableHead>
                  <TableHead className="text-right">Closed Accounts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.aging}>
                    <TableCell className="font-semibold">{row.aging}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatOspCurrency(row.totalOsp)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatOspPercentage(row.targetPercentage)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatOspCurrency(row.targetOsp)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatOspPercentage(row.resultPercentage)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatOspCurrency(row.ospClosed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.closedAccountCount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-bold">ALL</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{formatOspCurrency(state.report.all.totalOsp)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{formatOspPercentage(state.report.all.targetPercentage)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{formatOspCurrency(state.report.all.targetOsp)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{formatOspPercentage(state.report.all.resultPercentage)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{formatOspCurrency(state.report.all.ospClosed)}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{state.report.all.closedAccountCount.toLocaleString()}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p>
              CP-only payments contribute RM0 to OSP CLOSED. Each settlement cycle can contribute its Billing Principal once, on the sole Abort CP event date.
            </p>
          </div>
        </>
      ) : !state.loadingReport && !state.reportError ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 p-6 text-center">
          <Database className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Choose a configured source to load the report.</p>
          <p className="mt-1 text-sm text-muted-foreground">No masterlisting rows are downloaded to this browser.</p>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {state.loadingReport ? "Loading Billing Principal report." : state.report ? "Billing Principal report loaded." : ""}
      </p>
    </OperationalSectionCard>
  );

  return (
    <BillingPrincipalSavedTargetShell
      role={role}
      defaults={{
        sourceImportIds: state.selectedSourceIds,
        from: state.from,
        to: state.to,
        nicknameScope: state.selectedNickname ? [state.selectedNickname] : [],
        agingScope: BILLING_PRINCIPAL_AGINGS,
        targets: buildBillingPrincipalSavedTargetRows(
          state.report?.rows ?? [],
          BILLING_PRINCIPAL_AGINGS,
        ),
        ready: Boolean(
          state.report
          && !state.loadingReport
          && state.selectedSourceIds.length >= 1
          && state.selectedSourceIds.length <= 5
          && state.selectedAgings.length === BILLING_PRINCIPAL_AGINGS.length
          && state.from
          && state.to
          && state.from <= state.to
        ),
      }}
    >
      {legacyView}
    </BillingPrincipalSavedTargetShell>
  );
}
