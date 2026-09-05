import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSearchCollectionHistory,
  type SearchCollectionHistoryResponse,
} from "@/lib/api";
import {
  formatGeneralSearchCollectionPaymentDate,
  formatGeneralSearchCollectionRecordedAt,
  getGeneralSearchCollectionStatus,
} from "@/pages/general-search/collection-status";
import type { SearchResultRow } from "@/pages/general-search/types";
import { COLLECTION_DATA_CHANGED_EVENT, formatAmountRM } from "@/pages/collection/utils";

const HISTORY_PAGE_SIZE = 10;

type HistoryItem = SearchCollectionHistoryResponse["items"][number];

function effectiveStatusLabel(status: HistoryItem["effectiveStatus"] | SearchCollectionHistoryResponse["summary"]["effectiveStatus"]) {
  switch (status) {
    case "abort_cp":
      return "ABORT CP";
    case "cp":
      return "CP";
    case "requires_revalidation":
      return "Perlu pengesahan semula";
    case "superseded_by_automatic":
      return "Diganti oleh ABORT automatik";
    case "revoked":
      return "Dibatalkan";
    case "historical":
      return "Sejarah dipurge";
    default:
      return "Belum diklasifikasi";
  }
}

function sourceLabel(item: HistoryItem) {
  if (item.kind === "pool") return "POOL / bayaran luaran";
  return item.isHistorical ? "Collection pengguna (sejarah)" : "Collection pengguna";
}

function classificationSourceLabel(item: HistoryItem) {
  return item.classificationSource === "manual_verified_abort"
    ? "Manual Verified ABORT"
    : "Automatik";
}

interface GeneralSearchCollectionHistoryProps {
  row: SearchResultRow;
}

export function GeneralSearchCollectionHistory({ row }: GeneralSearchCollectionHistoryProps) {
  const status = getGeneralSearchCollectionStatus(row);
  const historyKey = status.historyKey;
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<SearchCollectionHistoryResponse | null>(null);

  const loadPage = useCallback(async (page: number) => {
    if (!historyKey) return;
    const requestId = ++requestIdRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await getSearchCollectionHistory(
        historyKey,
        page,
        HISTORY_PAGE_SIZE,
        { signal: controller.signal },
      );
      if (requestId !== requestIdRef.current) return;
      setHistory(response);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      setError("Sejarah collection tidak dapat dimuatkan. Sila cuba lagi.");
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [historyKey]);

  useEffect(() => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setExpanded(false);
    setLoading(false);
    setError("");
    setHistory(null);
  }, [historyKey]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const eventListenerController = new AbortController();
    const invalidateHistory = () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setHistory(null);
      setError("");
      setLoading(false);
      if (expanded) void loadPage(1);
    };
    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, invalidateHistory, {
      signal: eventListenerController.signal,
    });
    return () => eventListenerController.abort();
  }, [expanded, loadPage]);

  if (!historyKey || (status.state !== "recorded" && status.state !== "historical")) {
    return null;
  }

  const expandedStateProps = expanded
    ? { "aria-expanded": "true" as const }
    : { "aria-expanded": "false" as const };

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded) {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setLoading(false);
      return;
    }
    if (nextExpanded && !history && !loading) {
      void loadPage(1);
    }
  };

  return (
    <section
      aria-labelledby="general-search-collection-history-heading"
      className="rounded-lg border border-border/60 bg-background/70 p-4"
      data-testid="general-search-collection-history"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
            id="general-search-collection-history-heading"
          >
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            Sejarah collection penuh
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Dimuatkan hanya apabila diminta, {status.recordCount} rekod sepadan.
          </p>
        </div>
        <Button
          aria-controls="general-search-collection-history-content"
          {...expandedStateProps}
          onClick={toggleExpanded}
          size="sm"
          type="button"
          variant="outline"
        >
          {expanded ? "Tutup sejarah" : "Lihat sejarah"}
          {expanded
            ? <ChevronUp className="h-4 w-4" aria-hidden="true" />
            : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4" id="general-search-collection-history-content">
          {loading && !history ? (
            <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Memuatkan sejarah collection...
            </div>
          ) : null}

          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3" role="alert">
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {error}
              </p>
              <Button onClick={() => void loadPage(history?.page || 1)} size="sm" type="button" variant="outline">
                Cuba lagi
              </Button>
            </div>
          ) : null}

          {history ? (
            <>
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">Rekod collection</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">{history.summary.recordCount}</dd>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">Collection pengguna</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {formatAmountRM(history.summary.collectionAmount)}
                  </dd>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">POOL luaran</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {formatAmountRM(history.summary.poolAmount)}
                  </dd>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">Status efektif</dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {effectiveStatusLabel(history.summary.effectiveStatus)}
                  </dd>
                </div>
              </dl>

              {history.summary.poolContributionCount > 0 ? (
                <p className="rounded-md border border-amber-300/50 bg-amber-50/60 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                  Jumlah perlindungan efektif: {formatAmountRM(history.summary.totalCoveredAmount)}.
                  Amaun POOL kekal berasingan dan tidak dikreditkan sebagai collection pengguna.
                </p>
              ) : null}

              {history.items.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Tiada rekod pada halaman ini.
                </p>
              ) : (
                <ol className="space-y-3">
                  {history.items.map((item) => {
                    const actor = item.staffNickname || item.createdByLogin || "Tidak dinyatakan";
                    const source = item.sourceFilename || item.sourceImportName;
                    return (
                      <li className="rounded-md border border-border/60 p-3" key={item.id}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{sourceLabel(item)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatGeneralSearchCollectionPaymentDate(item.paymentDate)} · {actor}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">{formatAmountRM(item.amount)}</p>
                            <p className="mt-1 text-xs font-medium text-muted-foreground">
                              {effectiveStatusLabel(item.effectiveStatus)}
                            </p>
                          </div>
                        </div>
                        <dl className="mt-3 grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                          <dt className="text-muted-foreground">Direkod pada</dt>
                          <dd className="break-words text-foreground">
                            {formatGeneralSearchCollectionRecordedAt(item.createdAt)}
                          </dd>
                          {item.settlementDate ? (
                            <>
                              <dt className="text-muted-foreground">Tarikh settlement</dt>
                              <dd className="text-foreground">
                                {formatGeneralSearchCollectionPaymentDate(item.settlementDate)}
                              </dd>
                            </>
                          ) : null}
                          {source ? (
                            <>
                              <dt className="text-muted-foreground">Fail Saved</dt>
                              <dd className="break-words text-foreground">{source}</dd>
                            </>
                          ) : null}
                          <dt className="text-muted-foreground">Sumber status</dt>
                          <dd className="break-words text-foreground">
                            {classificationSourceLabel(item)}
                          </dd>
                          {item.automaticClassification ? (
                            <>
                              <dt className="text-muted-foreground">Status automatik</dt>
                              <dd className="text-foreground">
                                {effectiveStatusLabel(item.automaticClassification)}
                              </dd>
                            </>
                          ) : null}
                          {item.reason !== undefined ? (
                            <>
                              <dt className="text-muted-foreground">Sebab</dt>
                              <dd className="break-words text-foreground">{item.reason || "Tidak dinyatakan"}</dd>
                              <dt className="text-muted-foreground">Rujukan</dt>
                              <dd className="break-words text-foreground">{item.reference || "Tidak dinyatakan"}</dd>
                              {item.note ? (
                                <>
                                  <dt className="text-muted-foreground">Nota</dt>
                                  <dd className="break-words text-foreground">{item.note}</dd>
                                </>
                              ) : null}
                            </>
                          ) : null}
                          {item.purgedAt ? (
                            <>
                              <dt className="text-muted-foreground">
                                {item.kind === "pool" ? "Dibatalkan pada" : "Dipurge pada"}
                              </dt>
                              <dd className="break-words text-foreground">
                                {formatGeneralSearchCollectionRecordedAt(item.purgedAt)}
                                {item.purgedBy ? ` · ${item.purgedBy}` : ""}
                              </dd>
                            </>
                          ) : null}
                        </dl>
                      </li>
                    );
                  })}
                </ol>
              )}

              {history.totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <p className="text-xs text-muted-foreground">
                    Halaman {history.page} daripada {history.totalPages} · {history.total} entri
                  </p>
                  <div className="flex gap-2">
                    <Button
                      aria-label={`Muatkan halaman sejarah ${history.page - 1}`}
                      disabled={loading || !history.hasPreviousPage}
                      onClick={() => void loadPage(history.page - 1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Sebelumnya
                    </Button>
                    <Button
                      aria-label={`Muatkan halaman sejarah ${history.page + 1}`}
                      disabled={loading || !history.hasNextPage}
                      onClick={() => void loadPage(history.page + 1)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Seterusnya
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
