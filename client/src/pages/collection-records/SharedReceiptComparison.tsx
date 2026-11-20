import { useContext, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CollectionRecord } from "@/lib/api";
import { getCollectionReceiptComparison } from "@/lib/api/collection-records";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { parseCollectionApiErrorDetails } from "@/pages/collection/utils";
import type { CollectionReceiptComparison, CollectionReceiptLink } from "@shared/collection-receipt-breakdown";
import { CollectionRecordsTranslation } from "./collection-records-translation";
import { formatCollectionOptionalAmount } from "./collection-coverage";
import type { ViewCollectionReceipt } from "./types";

type ComparisonProps = {
  record: CollectionRecord;
  receiptId: string;
  peer: CollectionReceiptLink;
  onViewReceipt: ViewCollectionReceipt;
};

function ComparisonColumn({ title, identifier, entry }: { title: string; identifier: string; entry: CollectionReceiptComparison["original"] }) {
  const t = useContext(CollectionRecordsTranslation);
  const missing = t("common.collection.records.missing");
  const fields = [
    [t("common.collection.receipts.recordedPayment"), formatCollectionOptionalAmount(entry.recordedAmount, missing)],
    [t("common.collection.receipts.paymentDate"), formatIsoDateToDDMMYYYY(entry.paymentDate)],
    ["Batch", entry.batch],
    [t("common.collection.receipts.thisReceiptAmount"), formatCollectionOptionalAmount(entry.receiptAmount, missing)],
    [t("common.collection.compare.file"), entry.fileName],
  ];
  return (
    <section aria-label={title} className="grid min-w-0 gap-y-2 sm:row-span-6 sm:grid-rows-subgrid">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="wrap-anywhere text-xs text-muted-foreground">{identifier}</p>
      </div>
      <dl className="grid gap-y-2 text-sm sm:row-span-5 sm:grid-rows-subgrid">
        {fields.map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="wrap-anywhere tabular-nums">{value}</dd>
        </div>)}
      </dl>
    </section>
  );
}

function ComparisonBody({ record, receiptId, peer, onViewReceipt, peerLabel }: ComparisonProps & { peerLabel: string }) {
  const t = useContext(CollectionRecordsTranslation);
  const [result, setResult] = useState<CollectionReceiptComparison | "unavailable" | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getCollectionReceiptComparison(record.id, receiptId, peer.recordId, controller.signal).then(
      pair => { if (!controller.signal.aborted) setResult(pair); },
      error => {
        if (controller.signal.aborted) return;
        const { status } = parseCollectionApiErrorDetails(error);
        setResult(status === 403 || status === 404 ? "unavailable" : "error");
      },
    );
    return () => controller.abort();
  }, [record.id, receiptId, peer.recordId, attempt]);

  if (result === null) return <p role="status" className="text-sm">{t("common.collection.compare.loading")}</p>;
  if (result === "unavailable") return <p role="status" className="text-sm">{t("common.collection.compare.unavailable")}</p>;
  if (result === "error") return <div className="space-y-2">
    <p role="status" className="text-sm">{t("common.collection.compare.error")}</p>
    <Button type="button" variant="outline" onClick={() => { setResult(null); setAttempt(n => n + 1); }}>{t("common.collection.breakdown.retry")}</Button>
  </div>;
  return <>
    <div className="grid gap-y-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-2">
      <ComparisonColumn title={t("common.collection.compare.original")} identifier={record.customerName} entry={result.original} />
      <ComparisonColumn title={t("common.collection.compare.related")} identifier={peerLabel} entry={result.related} />
    </div>
    {record.receipts.some(receipt => receipt.id === receiptId) && <div className="border-t border-border pt-3">
      <Button type="button" variant="outline" onClick={event => onViewReceipt(record, event.currentTarget, receiptId)}>{t("common.collection.compare.preview")}</Button>
    </div>}
  </>;
}

export function SharedReceiptComparison(props: ComparisonProps) {
  const t = useContext(CollectionRecordsTranslation);
  const [open, setOpen] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const { peer } = props;
  const peerLabel = [
    peer.accountLast4 && `${t("common.collection.records.accountNumber")} •••• ${peer.accountLast4}`,
    peer.cardLast4 && `${t("common.collection.records.cardNumber")} •••• ${peer.cardLast4}`,
  ].filter(Boolean).join(" · ") || `ID ${peer.recordId}`;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button type="button" aria-label={t("common.collection.compare.open", { label: peerLabel })}
        className="min-h-9 max-w-full rounded-sm text-left font-medium wrap-anywhere text-primary underline underline-offset-4 focus-visible:outline-ring max-md:min-h-11">
        {peerLabel}
      </button>
    </DialogTrigger>
    {open && <DialogContent onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus(); }} className="max-w-xl text-left aria-hidden:opacity-25 motion-reduce:animate-none [&>button]:grid [&>button]:size-8 [&>button]:place-items-center max-md:[&>button]:top-1.5 max-md:[&>button]:right-2 max-md:[&>button]:size-11">
      <header className="space-y-1 pr-10">
        <DialogTitle ref={title} tabIndex={-1} className="outline-none">{t("common.collection.compare.title")}</DialogTitle>
        <DialogDescription>{t("common.collection.compare.description")}</DialogDescription>
      </header>
      <ComparisonBody {...props} peerLabel={peerLabel} />
    </DialogContent>}
  </Dialog>;
}
