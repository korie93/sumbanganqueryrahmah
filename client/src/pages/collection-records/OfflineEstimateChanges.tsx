import { useState } from "react";
import { formatCollectionCurrencyLabelFromCents } from "@shared/collection-amount-types";
import { Button } from "@/components/ui/button";
import type { OfflineEstimate, OfflineSelection } from "./collection-offline-selection";

export function OfflineEstimateChanges({ items, changes }: {
  items: OfflineSelection["items"];
  changes: readonly OfflineEstimate[];
}) {
  const [page, setPage] = useState(0);
  const size = 25;
  const start = page * size;
  return (
    <>
      <ul aria-label="Rekod berubah" className="max-h-[40dvh] min-w-0 divide-y divide-border overflow-y-auto overscroll-contain">
        {changes.slice(start, start + size).map((current) => {
          const before = items.get(current.id);
          if (!before) return null;
          return (
            <li key={current.id} className="min-w-0 space-y-2 py-2">
              <div className="min-w-0">
                <p className="wrap-anywhere text-sm font-semibold">{before.name}</p>
                <p className="wrap-anywhere text-xs text-muted-foreground">{before.id}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 text-sm">
                {([["Sebelum", before], ["Terkini", current]] as const).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="wrap-anywhere tabular-nums">{formatCollectionCurrencyLabelFromCents(value.cents)} · {value.receipts} resit</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
      {changes.length > size ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{start + 1}–{Math.min(start + size, changes.length)} daripada {changes.length}</span>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Sebelum</Button>
            <Button type="button" size="sm" variant="outline" disabled={start + size >= changes.length} onClick={() => setPage(page + 1)}>Seterusnya</Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
