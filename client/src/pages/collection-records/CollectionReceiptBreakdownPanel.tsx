import { useContext, useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CollectionReceiptBreakdown } from "@shared/collection-receipt-breakdown";
import { getCollectionReceiptBreakdown } from "@/lib/api/collection-records";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import type { CollectionRecord } from "@/lib/api";
import type { ViewCollectionReceipt } from "./types";
import { SharedReceiptComparison } from "./SharedReceiptComparison";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { CollectionRecordsTranslation } from "./collection-records-translation";
import { formatCollectionOptionalAmount } from "./collection-coverage";

type PanelProps = { record: CollectionRecord; onViewReceipt: ViewCollectionReceipt };

function ReceiptAmounts({ data, record, onViewReceipt }: PanelProps & { data: CollectionReceiptBreakdown }) {
  const t = useContext(CollectionRecordsTranslation);
  const missing = t("common.collection.records.missing");
  const fields = [
    [t("common.collection.receipts.recordedPayment"), data.recordedAmount],
    [t("common.collection.breakdown.due"), data.totalDue],
    [t("common.collection.breakdown.unique"), data.uniqueAmount],
    [t("common.collection.breakdown.shared"), data.sharedAmount],
  ] as const;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="wrap-anywhere font-medium tabular-nums">{formatCollectionOptionalAmount(value, missing)}</dd>
          </div>
        ))}
      </dl>
      {data.unclassifiedCount > 0 && <p className="text-muted-foreground">{t("common.collection.breakdown.unclassified", { count: data.unclassifiedCount })}</p>}
      {data.sharedReceipts.length > 0 && (
        <ul aria-label={t("common.collection.breakdown.shared")} className="divide-y divide-border rounded-md border border-border">
          {data.sharedReceipts.map(receipt => (
            <li key={receipt.id} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap justify-between gap-x-2 font-medium">
                <span className="min-w-0 wrap-anywhere">{receipt.fileName}</span>
                <span className="tabular-nums">{formatCollectionOptionalAmount(receipt.amount, missing)}</span>
              </div>
              {receipt.related && <>
                <p className="text-xs text-muted-foreground">{t("common.collection.breakdown.related", { count: receipt.related.count })}</p>
                <ul className="space-y-2">
                  {receipt.related.records.map(peer => (
                    <li key={peer.recordId} className="min-w-0 wrap-anywhere">
                      <SharedReceiptComparison record={record} receiptId={receipt.id} peer={peer} onViewReceipt={onViewReceipt} />
                      <p className="text-xs text-muted-foreground">{[peer.batch, formatIsoDateToDDMMYYYY(peer.paymentDate)].filter(Boolean).join(" · ")} · ID {peer.recordId}</p>
                    </li>
                  ))}
                </ul>
                {receipt.related.records.length < receipt.related.count && <p className="text-xs text-muted-foreground">{t("common.collection.breakdown.listed", { count: receipt.related.records.length, total: receipt.related.count })}</p>}
              </>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BreakdownRequest({ record, onViewReceipt, retry }: PanelProps & { retry: () => void }) {
  const t = useContext(CollectionRecordsTranslation);
  const [result, setResult] = useState<CollectionReceiptBreakdown | "error" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getCollectionReceiptBreakdown(record.id, controller.signal).then(
      data => { if (!controller.signal.aborted) setResult(data); },
      () => { if (!controller.signal.aborted) setResult("error"); },
    );
    return () => controller.abort();
  }, [record.id]);
  if (result === null) return <p role="status">{t("common.collection.breakdown.loading")}</p>;
  if (result === "error") return (
    <div className="flex flex-wrap items-center gap-x-3">
      <p role="status">{t("common.collection.breakdown.error")}</p>
      <button className="min-h-9 rounded-sm text-primary underline focus-visible:outline-ring" type="button" onClick={retry}>{t("common.collection.breakdown.retry")}</button>
    </div>
  );
  return <ReceiptAmounts data={result} record={record} onViewReceipt={onViewReceipt} />;
}

export function CollectionReceiptBreakdownPanel({ record, onViewReceipt }: PanelProps) {
  const t = useContext(CollectionRecordsTranslation);
  const id = useId();
  const [open, setOpen] = useState(Boolean(record.duplicateReceiptFlag));
  const [attempt, setAttempt] = useState(0);
  return (
    <section className="min-w-0 border-t border-border text-sm">
      <h3>
        <button type="button" {...getAriaExpandedProps(open)} aria-controls={id} onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm text-left font-semibold focus-visible:outline-ring">
          {t("common.collection.breakdown.title")}
          <ChevronDown aria-hidden="true" className={open ? "size-4 rotate-180" : "size-4"} />
        </button>
      </h3>
      <div id={id} hidden={!open}>{open && <BreakdownRequest key={attempt} record={record} onViewReceipt={onViewReceipt} retry={() => setAttempt(n => n + 1)} />}</div>
    </section>
  );
}
