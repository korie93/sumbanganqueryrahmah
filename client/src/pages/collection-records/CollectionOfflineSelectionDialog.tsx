import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatCollectionCurrencyLabelFromCents } from "@shared/collection-amount-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { getOfflineSelectionTotals, updateOfflineSelection, type OfflineEstimate, type OfflineReceiptIssue, type OfflineSelection } from "./collection-offline-selection";
import { OfflineEstimateChanges } from "./OfflineEstimateChanges";
import { OfflineReceiptIssueDetail } from "./OfflineReceiptIssueDetail";
import type { ViewCollectionReceipt } from "./types";

type Props = {
  mode: "review" | "confirm" | "changes";
  state: OfflineSelection;
  payment: string;
  receipts: number;
  notice: string;
  busy: boolean;
  onClose: () => void;
  onExport: () => void;
  onRemove: (id: string) => void;
  onRestoreFocus: () => void;
  changes: readonly OfflineEstimate[];
  receiptIssue: OfflineReceiptIssue | null;
  onViewReceipt: ViewCollectionReceipt;
  onAccessLost: () => void;
};

const PAGE_SIZE = 25;

export default function CollectionOfflineSelectionDialog({ mode, state, payment, receipts, notice, busy, onClose, onExport, onRemove, onRestoreFocus, changes, receiptIssue, onViewReceipt, onAccessLost }: Props) {
  const review = mode === "review";
  const changed = mode === "changes";
  const heading = useRef<HTMLHeadingElement>(null);
  const projected = useMemo(() => changed
    ? getOfflineSelectionTotals(updateOfflineSelection(state, { type: "accept", estimates: changes }).items) : null,
  [changed, changes, state]);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const actions = useRef(new Map<string, HTMLButtonElement>());
  const results = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    const matches = [...state.items.values()].filter((item) => !text || item.name.toLocaleLowerCase().includes(text) || item.id.toLocaleLowerCase().includes(text));
    const problem = matches.findIndex((item) => item.id === receiptIssue?.recordId);
    if (problem > 0) matches.unshift(...matches.splice(problem, 1));
    return matches;
  }, [query, state.items, receiptIssue]);
  const page = Math.min(index, Math.max(0, Math.ceil(results.length / PAGE_SIZE) - 1));
  const current = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { if (review) search.current?.focus(); }, [review]);
  useEffect(() => { if (changed) heading.current?.focus(); }, [changed, changes]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-floating-ai-avoid="true"
        className="flex min-w-0 max-w-xl flex-col gap-3 sm:gap-4 [&>*]:shrink-0 [&>ul]:min-h-12 [&>ul]:shrink"
        onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}>
        <DialogHeader className="min-w-0 pr-6 text-left">
          <DialogTitle ref={heading} tabIndex={-1}>{review ? "Rekod dipilih" : changed ? "Semak perubahan rekod" : "Eksport rekod dipilih"}</DialogTitle>
          <DialogDescription>{review ? "Semak rekod daripada semua halaman dan carian." : changed
            ? "Jumlah bayaran atau bilangan resit berubah sejak rekod dipilih. Sahkan nilai terkini sebelum eksport."
            : "Muat turun fail Excel bersama resit asal dalam satu fail ZIP."}</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-y border-border py-2.5 text-sm tabular-nums">
          <span>{state.items.size} rekod dipilih</span>
          <span className="text-muted-foreground">{changed ? "Jumlah terkini" : "Anggaran bayaran"} <strong className="whitespace-nowrap font-semibold text-foreground">{projected ? formatCollectionCurrencyLabelFromCents(projected.cents) : payment}</strong></span>
        </div>
        {notice ? <p role="status" className="wrap-anywhere text-sm font-medium">{notice}</p> : null}
        {review ? (
          <>
            <Input ref={search} id="offline-selection-search" name="offline-selection-search" type="search"
              autoComplete="off" aria-label="Cari dalam pilihan" placeholder="Cari nama atau ID rekod" value={query}
              onChange={(event) => { setQuery(event.target.value); setIndex(0); }} />
            {current.length ? (
              <ul aria-label="Senarai rekod dipilih" className="min-w-0 max-h-[40dvh] divide-y divide-border overflow-y-auto overscroll-contain">
                {current.map((item, position) => (
                  <li key={item.id} className={receiptIssue?.recordId === item.id
                    ? "flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-warning/60 bg-muted px-2 py-2"
                    : "flex min-w-0 items-center gap-2 py-2"}>
                    <div className="min-w-0 flex-1">
                      <div className="wrap-anywhere text-sm font-medium">{item.name}</div>
                      <div id={`offline-selection-summary-${item.id}`} className="wrap-anywhere text-xs text-muted-foreground">{formatIsoDateToDDMMYYYY(item.date)} · {item.id}</div>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">{formatCollectionCurrencyLabelFromCents(item.cents)}</span>
                    <Button ref={(element) => { if (element) actions.current.set(item.id, element); else actions.current.delete(item.id); }}
                      type="button" size="icon" variant="ghost" className="size-10 shrink-0" aria-label={`Keluarkan ${item.name} daripada pilihan`} title="Keluarkan daripada pilihan"
                      aria-describedby={`offline-selection-summary-${item.id}`}
                      onClick={() => {
                        const neighbour = current[position + 1] ?? current[position - 1];
                        (neighbour ? actions.current.get(neighbour.id) : search.current)?.focus();
                        onRemove(item.id);
                      }}><X aria-hidden="true" className="size-4" /></Button>
                    {receiptIssue?.recordId === item.id ? (
                      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{receiptIssue.receiptNumber === null
                          ? "Semak resit rekod ini" : `Resit ${receiptIssue.receiptNumber} daripada ${receiptIssue.receiptCount}`}</span>
                        <OfflineReceiptIssueDetail id={item.id} onViewReceipt={onViewReceipt} onAccessLost={onAccessLost} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <p role="status" className="py-3 text-sm text-muted-foreground">{state.items.size ? "Tiada rekod sepadan dalam pilihan." : "Belum ada rekod dipilih."}</p>}
            {results.length > PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{page * PAGE_SIZE + 1}–{page * PAGE_SIZE + current.length} daripada {results.length}</span>
                <div className="flex gap-1">
                  <Button size="sm" type="button" variant="outline" disabled={!page} onClick={() => setIndex(page - 1)}>Sebelum</Button>
                  <Button size="sm" type="button" variant="outline" disabled={(page + 1) * PAGE_SIZE >= results.length} onClick={() => setIndex(page + 1)}>Seterusnya</Button>
                </div>
              </div>
            ) : null}
          </>
        ) : changed ? <OfflineEstimateChanges items={state.items} changes={changes} /> : (
          <div className="space-y-2 text-sm">
            <p>{receipts ? `${receipts} resit dijangka.` : "Tiada resit dalam rekod dipilih. Fail ZIP mengandungi rekod Excel."}</p>
            <p className="text-muted-foreground">Ekstrak ZIP dahulu sebelum membuka pautan resit dalam Excel.</p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{review ? "Tutup" : "Batal"}</Button>
          {!review ? <Button type="button" onClick={onExport} disabled={busy || !state.items.size}
            className="h-auto min-h-10 whitespace-normal"
            aria-label={busy ? "Menyediakan ZIP…" : undefined}>
            {busy ? <span role="status">Menyediakan ZIP…</span> : changed ? "Sahkan perubahan dan muat turun ZIP" : "Muat turun ZIP"}
          </Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
