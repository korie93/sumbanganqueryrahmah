import { createContext, useContext, useEffect, useRef, type Dispatch } from "react";
import type { CollectionRecord } from "@/lib/api/collection-types";
import type { OfflineSelection, updateOfflineSelection } from "./collection-offline-selection";

export const CollectionSelectionContext = createContext<{
  state: OfflineSelection;
  dispatch: Dispatch<Parameters<typeof updateOfflineSelection>[1]>;
} | null>(null);

const checkboxClass = "size-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CollectionRecordCheckbox({ record }: { record: CollectionRecord }) {
  const selection = useContext(CollectionSelectionContext);
  if (!selection) return null;
  return (
    <label className="flex min-h-11 min-w-9 shrink-0 cursor-pointer items-center justify-start md:min-h-9 md:min-w-6">
      <input type="checkbox" className={checkboxClass}
        aria-label={`Pilih rekod ${record.id} untuk ${record.customerName}`}
        checked={selection.state.items.has(record.id)}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => selection.dispatch(event.currentTarget.checked
          ? { type: "select", records: [record] }
          : { type: "remove", ids: [record.id] })} />
    </label>
  );
}

export function CollectionPageCheckbox({ records, showLabel = false }: { records: CollectionRecord[]; showLabel?: boolean }) {
  const selection = useContext(CollectionSelectionContext);
  const input = useRef<HTMLInputElement>(null);
  const selected = records.filter((record) => selection?.state.items.has(record.id)).length;
  const count = records.length;
  useEffect(() => {
    if (input.current) input.current.indeterminate = selected > 0 && selected < count;
  }, [selected, count]);
  if (!selection) return null;
  const label = "Pilih semua rekod di halaman ini";
  return (
    <label className="flex min-h-11 min-w-6 shrink-0 cursor-pointer items-center gap-2 text-sm md:min-h-9" title={label}>
      <input ref={input} type="checkbox" aria-label={label} className={checkboxClass}
        checked={count > 0 && selected === count} disabled={count === 0}
        onChange={(event) => selection.dispatch(event.currentTarget.checked
          ? { type: "select", records }
          : { type: "remove", ids: records.map((record) => record.id) })} />
      {showLabel ? label : null}
    </label>
  );
}
