import { CheckCircle2 } from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import type {
  ImportComparisonCategory,
  ImportComparisonItem,
  ImportComparisonResponse,
  ImportComparisonSide,
} from "@shared/common/import-comparison-contract";

export const customerComparisonCategoryLabels: Record<ImportComparisonItem["category"], string> = {
  matched: "Matched",
  account_changed: "Account changed",
  baseline_only: "Baseline only",
  current_only: "Compare only",
  conflict: "Identity conflict",
  unidentified: "Needs identifiers",
};

const matchBasisLabels: Record<ImportComparisonItem["matchBasis"], string> = {
  ic: "IC",
  account: "account",
  phone_and_name: "phone + name",
  none: "none",
};

export function getCustomerComparisonCategoryCount(
  category: ImportComparisonCategory,
  summary: ImportComparisonResponse["summary"],
): number {
  if (category === "matched") return summary.matched;
  if (category === "account_changed") return summary.accountChanged;
  if (category === "baseline_only") return summary.baselineOnly;
  if (category === "current_only") return summary.currentOnly;
  if (category === "conflict") return summary.conflicts;
  if (category === "unidentified") return summary.unidentified;
  return summary.matched
    + summary.accountChanged
    + summary.baselineOnly
    + summary.currentOnly
    + summary.conflicts
    + summary.unidentified;
}

function getCategoryClassName(category: ImportComparisonItem["category"]): string {
  if (category === "matched") {
    return "border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-200";
  }
  if (category === "conflict") {
    return "border-rose-300 text-rose-800 dark:border-rose-700 dark:text-rose-200";
  }
  if (category === "account_changed") {
    return "border-amber-300 text-amber-900 dark:border-amber-700 dark:text-amber-100";
  }
  return "text-muted-foreground";
}

function formatValue(value: string | null | undefined): string {
  return String(value || "").trim() || "Not available";
}

function formatAccounts(side: ImportComparisonSide | null): string {
  return side?.accountNumbers.length
    ? side.accountNumbers.join(", ")
    : "Not available";
}

function ComparisonIdentityDetails({
  label,
  side,
}: {
  label: string;
  side: ImportComparisonSide | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xxs font-semibold uppercase tracking-label-md text-muted-foreground">
        {label}
      </p>
      {side ? (
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div className="col-span-2">
            <dt className="sr-only">Customer</dt>
            <dd className="break-words font-medium text-foreground">
              {formatValue(side.customerName)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">IC</dt>
            <dd className="break-all text-foreground">{formatValue(side.icNumber)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="break-all text-foreground">{formatValue(side.customerPhone)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Account</dt>
            <dd className="break-all text-foreground">{formatAccounts(side)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">No matching record</p>
      )}
    </div>
  );
}

export function SavedCustomerComparisonResults({
  data,
}: {
  data: ImportComparisonResponse;
}) {
  if (data.items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-foreground">No records match this filter</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try another status or clear the search field.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border rounded-md border border-border md:hidden">
        {data.items.map((item) => (
          <article key={item.id} className="space-y-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline" className={getCategoryClassName(item.category)}>
                {customerComparisonCategoryLabels[item.category]}
              </Badge>
              <span className="text-xxs text-muted-foreground">
                Matched by {matchBasisLabels[item.matchBasis]}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ComparisonIdentityDetails label="Baseline" side={item.baseline} />
              <ComparisonIdentityDetails label="Compare" side={item.current} />
            </div>
          </article>
        ))}
      </div>

      <HorizontalScrollHint
        className="hidden rounded-md border border-border md:block"
        ariaLabel="Customer and account comparison table"
        hint="Scroll comparison table"
        showNavigationControls
      >
        <table className="w-full min-w-[1080px] text-sm">
          <caption className="sr-only">
            Customer and account differences between {data.baseline.name} and {data.current.name}
          </caption>
          <thead className="bg-muted/70">
            <tr>
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Status</th>
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Matched by</th>
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Customer</th>
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">IC</th>
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Phone</th>
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Baseline accounts</th>
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">Compare accounts</th>
              <th scope="col" className="p-3 text-right font-medium text-muted-foreground">Rows</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => {
              const preferred = item.current ?? item.baseline;
              return (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="p-3">
                    <Badge variant="outline" className={getCategoryClassName(item.category)}>
                      {customerComparisonCategoryLabels[item.category]}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {matchBasisLabels[item.matchBasis]}
                  </td>
                  <th scope="row" className="max-w-56 break-words p-3 text-left font-medium text-foreground">
                    {formatValue(preferred?.customerName)}
                  </th>
                  <td className="max-w-44 break-all p-3 text-muted-foreground">
                    {item.baseline?.icNumber && item.current?.icNumber
                      && item.baseline.icNumber !== item.current.icNumber
                      ? `${item.baseline.icNumber} / ${item.current.icNumber}`
                      : formatValue(preferred?.icNumber)}
                  </td>
                  <td className="max-w-44 break-all p-3 text-muted-foreground">
                    {formatValue(preferred?.customerPhone)}
                  </td>
                  <td className="max-w-52 break-all p-3 text-muted-foreground">
                    {formatAccounts(item.baseline)}
                  </td>
                  <td className="max-w-52 break-all p-3 text-muted-foreground">
                    {formatAccounts(item.current)}
                  </td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">
                    {item.baseline?.occurrences ?? 0} / {item.current?.occurrences ?? 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </HorizontalScrollHint>
    </>
  );
}
