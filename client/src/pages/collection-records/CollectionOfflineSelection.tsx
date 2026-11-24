import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { COLLECTION_OFFLINE_EXPORT_MAX_RECORDS } from "@shared/collection-offline-export";
import { formatCollectionCurrencyLabelFromCents } from "@shared/collection-amount-types";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { fetchSelectedCollectionOffline } from "@/lib/api/collection-records";
import { parseCollectionApiErrorDetails } from "@/pages/collection/utils";
import { CollectionSelectionContext } from "./CollectionSelectionCheckbox";
import {
  emptyOfflineSelection, getOfflineSelectionTotals, readOfflineEstimateChanges, readOfflineReceiptIssue,
  updateOfflineSelection, type OfflineEstimate, type OfflineReceiptIssue,
} from "./collection-offline-selection";
import type { ViewCollectionReceipt } from "./types";

const SelectionDialog = lazy(() => import("./CollectionOfflineSelectionDialog"));
type SelectionDialogMode = "review" | "confirm" | "changes";
type WorkspaceProps = { children: ReactNode; onViewReceipt: ViewCollectionReceipt };

export function CollectionOfflineSelection({ role, ...props }: WorkspaceProps & { role: string }) {
  return role === "superuser" ? <SuperuserSelection {...props} /> : <>{props.children}</>;
}

function SuperuserSelection({ children, onViewReceipt }: WorkspaceProps) {
  const [state, dispatch] = useReducer(updateOfflineSelection, undefined, emptyOfflineSelection);
  const [mode, setMode] = useState<SelectionDialogMode | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<OfflineEstimate[]>([]);
  const [receiptIssue, setReceiptIssue] = useState<OfflineReceiptIssue | null>(null);
  const request = useRef<AbortController | null>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const context = useMemo(() => ({ state, dispatch }), [state]);
  const totals = useMemo(() => getOfflineSelectionTotals(state.items), [state.items]);
  const payment = formatCollectionCurrencyLabelFromCents(totals.cents);
  const count = state.items.size;
  useEffect(() => () => { request.current?.abort(); }, []);

  function open(next: SelectionDialogMode, button: HTMLButtonElement) {
    opener.current = button;
    setNotice("");
    setChanges([]);
    setMode(next);
  }

  function close() {
    if (request.current) {
      request.current.abort();
      request.current = null;
      setBusy(false);
      setNotice("Eksport dibatalkan. Pilihan anda dikekalkan.");
    }
    setMode(null);
  }

  function clearAfterAccessLoss() {
    dispatch({ type: "reset" });
    setMode(null);
    setChanges([]);
    setReceiptIssue(null);
    setNotice("Akses eksport tidak tersedia. Sila semak sesi anda.");
  }

  async function exportSelection() {
    if (!count || request.current) return;
    const approved = mode === "changes" ? changes : [];
    const submitted = approved.length ? updateOfflineSelection(state, { type: "accept", estimates: approved }) : state;
    if (approved.length) {
      dispatch({ type: "accept", estimates: approved });
      setChanges([]);
      setMode("confirm");
    }
    setReceiptIssue(null);
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setNotice("");
    try {
      const expected = [...submitted.items.values()].map(({ id, cents, receipts }) => ({ id, cents, receipts }));
      const { blob, filename } = await fetchSelectedCollectionOffline([...submitted.items.keys()], controller.signal, expected);
      if (controller.signal.aborted) return;
      downloadBlob(blob, filename);
      setMode(null);
      setNotice("Muat turun ZIP dimulakan. Pilihan anda dikekalkan.");
    } catch (error) {
      if (controller.signal.aborted) return;
      const { code, details, status, message } = parseCollectionApiErrorDetails(error);
      if (status === 409 && code === "OFFLINE_EXPORT_SELECTION_CHANGED") {
        const current = readOfflineEstimateChanges(details, submitted.items);
        setChanges(current);
        setMode(current.length ? "changes" : "review");
        if (!current.length) setNotice("Perubahan rekod tidak dapat disahkan. Semak semula pilihan anda.");
      } else if (status === 409 && code === "INVALID_RECEIPT") {
        const issue = readOfflineReceiptIssue(details, submitted.items);
        setReceiptIssue(issue);
        setNotice(issue ? "Eksport dihentikan. Semak resit pada rekod yang ditanda atau keluarkan rekod itu daripada pilihan." : message);
        setMode("review");
      } else if (code === "OFFLINE_EXPORT_RECORDS_UNAVAILABLE") {
        const unavailable = details && typeof details === "object" && "unavailableIds" in details
          ? details.unavailableIds : null;
        const ids = Array.isArray(unavailable)
          ? [...new Set(unavailable.filter((id): id is string => typeof id === "string" && state.items.has(id)))] : [];
        dispatch({ type: "remove", ids });
        setNotice(ids.length
          ? `${ids.length} rekod yang tidak lagi tersedia telah dikeluarkan. Semak pilihan sebelum eksport semula.`
          : "Sebahagian rekod tidak lagi tersedia. Semak semula pilihan anda.");
        setMode("review");
      } else if (status === 401 || status === 403) {
        clearAfterAccessLoss();
      } else if (status === 413) {
        setNotice("Saiz eksport melebihi had. Kurangkan bilangan rekod dan cuba semula.");
      } else {
        setNotice(message || "Eksport gagal. Pilihan anda dikekalkan untuk dicuba semula.");
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <CollectionSelectionContext.Provider value={context}>
      <section aria-label="Pilihan eksport" className="min-w-0 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div role="status" className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <strong className="font-semibold tabular-nums">{count} rekod dipilih</strong>
            <span className="text-muted-foreground">Jumlah bayaran dipilih <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{payment}</span></span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Button ref={reviewButton} type="button" size="sm" variant="ghost" className="min-h-10"
              onClick={(event) => open("review", event.currentTarget)}>Lihat pilihan</Button>
            <Button type="button" size="sm" variant="ghost" disabled={!count} className="min-h-10"
              onClick={() => {
                dispatch({ type: "clear" });
                setReceiptIssue(null);
                setNotice("");
                reviewButton.current?.focus();
              }}>Kosongkan pilihan</Button>
            <Button type="button" size="sm" disabled={!count} className="min-h-10 gap-2"
              onClick={(event) => open("confirm", event.currentTarget)}><Download aria-hidden="true" className="size-4" />Export pilihan (ZIP)</Button>
          </div>
        </div>
        {state.limitReached ? <p role="alert" className="mt-2 text-sm text-foreground">Maksimum {COLLECTION_OFFLINE_EXPORT_MAX_RECORDS} rekod bagi setiap eksport. Kurangkan pilihan untuk meneruskan.</p> : null}
        {state.cleared ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 border-t border-border pt-1 text-sm">
            <span role="status">{state.cleared.size} rekod dikeluarkan daripada pilihan.</span>
            <Button type="button" variant="link" size="sm" onClick={() => {
              dispatch({ type: "undo-clear" });
              setNotice("Pilihan dipulihkan.");
              reviewButton.current?.focus();
            }}>Pulihkan pilihan</Button>
          </div>
        ) : null}
        {notice && !mode ? <p role="status" className="mt-2 text-sm text-muted-foreground">{notice}</p> : null}
      </section>
      {children}
      {mode ? (
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Membuka pilihan…</p>}>
          <SelectionDialog mode={mode} state={state} payment={payment} receipts={totals.receipts} notice={notice}
            changes={changes} receiptIssue={receiptIssue && state.items.has(receiptIssue.recordId) ? receiptIssue : null}
            onViewReceipt={onViewReceipt} onAccessLost={clearAfterAccessLoss}
            busy={busy} onClose={close} onExport={() => void exportSelection()}
            onRemove={(id) => {
              dispatch({ type: "remove", ids: [id] });
              if (receiptIssue?.recordId === id) {
                setReceiptIssue(null);
                setNotice("Rekod tersebut telah dikeluarkan daripada pilihan.");
              }
            }}
            onRestoreFocus={() => (opener.current?.isConnected && !opener.current.disabled ? opener.current : reviewButton.current)?.focus({ preventScroll: true })} />
        </Suspense>
      ) : null}
    </CollectionSelectionContext.Provider>
  );
}
