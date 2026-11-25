import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { collectionExcelColumns, allCollectionExcelColumnIds, type CollectionExcelColumnId } from "@shared/common/collection-excel-columns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAriaExpandedProps } from "@/lib/aria-state-props";

type Props = {
  selected: readonly CollectionExcelColumnId[];
  onChange: (columns: readonly CollectionExcelColumnId[]) => void;
  disabled: boolean;
};

const dailyColumns: readonly CollectionExcelColumnId[] = ["customerName", "cardNumber", "accountNumber", "amount", "paymentDate", "receipt"];

export function CollectionExcelColumnPicker({ selected, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const search = query.trim().toLocaleLowerCase();
  const matches = collectionExcelColumns.filter(column => column.label.toLocaleLowerCase().includes(search));
  const chosen = new Set(selected);
  const selectedMatches = matches.filter(column => chosen.has(column.id)).length;

  function setMatches(checked: boolean) {
    const next = new Set(selected);
    for (const { id } of matches) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange(allCollectionExcelColumnIds.filter(id => next.has(id)));
  }

  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center justify-between gap-x-1 px-1">
        <Button type="button" variant="ghost" {...getAriaExpandedProps(expanded)} aria-controls={expanded ? "offline-excel-columns" : undefined}
          className="justify-start gap-1.5 px-2" onClick={() => setExpanded(!expanded)}>
          <ChevronDown aria-hidden="true" className={expanded ? "" : "-rotate-90"} />
          Lajur Excel <span className="font-normal tabular-nums text-muted-foreground">({selected.length}/{collectionExcelColumns.length})</span>
        </Button>
        {(!expanded || !search) && <Button type="button" size="sm" variant="link" className="px-2" disabled={disabled}
          title="Gunakan enam lajur kutipan harian" onClick={() => { setQuery(""); onChange(dailyColumns); }}>
          Kutipan harian
        </Button>}
      </div>
      {expanded && <fieldset id="offline-excel-columns" disabled={disabled} className="min-w-0 space-y-2 border-t border-border px-3 py-2">
        <legend className="sr-only">Pilih lajur untuk fail Excel</legend>
        <Input type="search" id="offline-excel-column-search" name="excelColumnSearch" aria-label="Cari lajur Excel"
          placeholder="Cari lajur…" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
          <Button type="button" size="sm" variant="ghost" className="whitespace-normal max-sm:px-1" disabled={selectedMatches === matches.length}
            onClick={() => setMatches(true)}>{search ? "Pilih hasil carian" : "Pilih semua lajur"}</Button>
          <Button type="button" size="sm" variant="ghost" className="whitespace-normal max-sm:px-1" disabled={!selectedMatches}
            onClick={() => setMatches(false)}>{search ? "Nyahpilih hasil carian" : "Kosongkan lajur"}</Button>
        </div>
        <div className="grid max-h-[min(26dvh,14rem)] grid-cols-1 gap-x-3 overflow-y-auto overscroll-contain sm:grid-cols-2">
          {matches.map(({ id, label }) => (
            <label key={id} className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 px-1">
              <input type="checkbox" name="excelColumns" value={id} checked={chosen.has(id)}
                className="size-4 shrink-0 accent-primary" onChange={event => {
                  const checked = event.target.checked;
                  onChange(allCollectionExcelColumnIds.filter(column => column === id ? checked : chosen.has(column)));
                }} />
              <span className="wrap-anywhere">{label}</span>
            </label>
          ))}
          {!matches.length && <p role="status" className="py-2 text-muted-foreground">Tiada lajur sepadan.</p>}
        </div>
        {!selected.length && <p role="status">Pilih sekurang-kurangnya satu lajur.</p>}
      </fieldset>}
    </div>
  );
}
