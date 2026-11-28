import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { CollectionRecord } from "@/lib/api";
import { CollectionRecordDetailsContent, OpenCollectionRecord } from "./CollectionRecordName";
import { CollectionRecordsTranslation } from "./collection-records-translation";
import type { ViewCollectionReceipt } from "./types";

type Props = {
  children: ReactNode;
  records: CollectionRecord[];
  offset: number;
  loading: boolean;
  failed?: boolean | undefined;
  previousPage?: (() => void) | undefined;
  nextPage?: (() => void) | undefined;
  onOpenRecord?: ((record: CollectionRecord) => void) | undefined;
  onViewReceipt: ViewCollectionReceipt;
};

type PageTurn = { step: 1 | -1; offset: number; records: CollectionRecord[] };

export function CollectionRecordBrowser({ children, records, offset, loading, failed, previousPage, nextPage, onOpenRecord, onViewReceipt }: Props) {
  const t = useContext(CollectionRecordsTranslation);
  const list = useRef<HTMLDivElement>(null);
  const returnId = useRef<string | null>(null);
  const moved = useRef(false);
  const [id, setId] = useState<string | null>(null);
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const index = id === null ? -1 : records.findIndex((record) => record.id === id);
  // View All updates its page number before its rows arrive. Wait for both.
  const arrived = turn && !loading && offset !== turn.offset && records !== turn.records;
  const activeIndex = arrived ? (turn.step > 0 ? 0 : records.length - 1) : index;
  const active = records[activeIndex];
  const displayedOffset = turn && !arrived ? turn.offset : offset;

  const select = useCallback((record: CollectionRecord) => {
    returnId.current = record.id;
    setId(record.id);
    onOpenRecord?.(record);
  }, [onOpenRecord]);

  useEffect(() => {
    if (arrived && active) {
      setTurn(null);
      select(active);
    } else if (id && !loading && !active) {
      setTurn(null);
      setId(null);
    } else if (turn && failed && !loading) {
      setTurn(null);
    }
  }, [active, arrived, failed, id, loading, select, turn]);

  function move(step: 1 | -1) {
    if (loading || turn || !active) return;
    const neighbor = records[index + step];
    if (neighbor) {
      moved.current = true;
      select(neighbor);
      return;
    }
    const changePage = step > 0 ? nextPage : previousPage;
    if (changePage) {
      moved.current = true;
      setTurn({ step, offset, records });
      changePage();
    }
  }

  function close() {
    setTurn(null);
    setId(null);
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    const container = list.current;
    if (!container) return;
    const target = returnId.current && container.querySelector<HTMLElement>(`[data-record-trigger="${CSS.escape(returnId.current)}"]`);
    const fallback = container.querySelector<HTMLElement>('[role="region"][tabindex], button:not(:disabled)')
      ?? container.closest<HTMLElement>('[role="dialog"], [data-testid="collection-records-page"]');
    (target || fallback)?.focus({ preventScroll: !moved.current });
    moved.current = false;
  }

  return (
    <div ref={list} className="contents">
      <OpenCollectionRecord.Provider value={select}>{children}</OpenCollectionRecord.Provider>
      <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open) close(); }}>
        {active && (
          <CollectionRecordDetailsContent
            record={active}
            number={displayedOffset + activeIndex + 1}
            onViewReceipt={onViewReceipt}
            onCloseAutoFocus={restoreFocus}
            navigation={(records.length > 1 || previousPage || nextPage) && (
              <div className="flex shrink-0 gap-1" aria-busy={Boolean(turn)}>
                {([-1, 1] as const).map((step) => {
                  const adjacentPage = step < 0 ? previousPage : nextPage;
                  const enabled = !loading && !turn && Boolean(records[activeIndex + step] || adjacentPage);
                  const label = t(step < 0 ? "common.collection.records.previousRecord" : "common.collection.records.nextRecord");
                  const Icon = step < 0 ? ChevronLeft : ChevronRight;
                  return (
                    <Button
                      key={step} type="button" variant="ghost" size="icon"
                      aria-label={label} title={label} aria-disabled={!enabled}
                      className="aria-disabled:opacity-40"
                      onClick={() => { if (enabled) move(step); }}
                    >
                      {turn?.step === step
                        ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                        : <Icon aria-hidden="true" />}
                    </Button>
                  );
                })}
              </div>
            )}
          />
        )}
      </Dialog>
    </div>
  );
}
