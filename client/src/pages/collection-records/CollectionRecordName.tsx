import { CollectionRecordsTranslation } from "./collection-records-translation";
import { useContext, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CollectionRecord } from "@/lib/api";
import type { ViewCollectionReceipt } from "./types";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { formatCollectionOptionalAmount, getCollectionCpStatusLabel, getCollectionMatchAccuracyLabel } from "./collection-coverage";
import { getCollectionRecordSourceLabel } from "./collection-source-label";
import { getCollectionCardNumberLabel } from "./utils";
import { CollectionReceiptBreakdownPanel } from "./CollectionReceiptBreakdownPanel";

function DetailGroup({ title, fields, children }: {
  title: string;
  fields: [label: string, value: string, treatment?: "wide" | "primary"][];
  children?: ReactNode;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {fields.map(([label, value, treatment]) => (
          <div key={label} className={cn("min-w-0", treatment === "wide" && "col-span-2 sm:col-span-1")}>
            <dt className="text-xs leading-4 text-muted-foreground">{label}</dt>
            <dd className={cn("mt-0.5 whitespace-normal wrap-anywhere text-sm leading-5 tabular-nums", treatment === "primary" && "font-semibold")}>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

export function CollectionRecordName({ record, number, onOpenRecord, onViewReceipt }: {
  record: CollectionRecord;
  number: number;
  onViewReceipt: ViewCollectionReceipt;
  onOpenRecord?: ((record: CollectionRecord) => void) | undefined;
}) {
  const t = useContext(CollectionRecordsTranslation);
  const missing = t("common.collection.records.missing");
  const [open, setOpen] = useState(false);
  const name = record.customerName?.trim() || `Rekod #${number}`;
  const receiptCount = record.receipts?.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) onOpenRecord?.(record);
    }}>
      <DialogTrigger asChild>
        <button type="button" className="min-h-8 max-w-full cursor-pointer rounded-sm text-left font-medium whitespace-normal wrap-anywhere text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {name}
        </button>
      </DialogTrigger>
      {open && (
        <DialogContent className="flex max-w-xl flex-col gap-0 overflow-hidden p-0 text-left aria-hidden:opacity-25 sm:p-0 motion-reduce:animate-none [&>button]:grid [&>button]:place-items-center [&>button]:size-8 max-md:[&>button]:size-[44px] max-md:[&>button]:top-1.5 max-md:[&>button]:right-2">
          <div className="min-w-0 shrink-0 px-4 pt-4 pr-16 sm:px-6 sm:pt-5 sm:pr-16">
            <DialogTitle className="max-h-20 overflow-y-auto wrap-anywhere text-lg leading-6">{name}</DialogTitle>
            <DialogDescription className="sr-only">Butiran rekod #{number}</DialogDescription>
          </div>
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 pt-3 pb-4 sm:px-6 sm:pb-5">
            <DetailGroup title="Bayaran" fields={[
              [t("common.collection.records.cardNumber"), getCollectionCardNumberLabel(record.cardNumber), "wide"],
              [t("common.collection.records.accountNumber"), record.accountNumber || "-", "wide"],
              ["Jumlah dibayar", formatCollectionOptionalAmount(record.amount, missing), "primary"],
              ["Tarikh bayaran", formatIsoDateToDDMMYYYY(record.paymentDate)],
            ]}>
              {receiptCount > 0 ? (
                <Button type="button" className="mt-2.5" variant="outline" size="sm" onClick={event => onViewReceipt(record, event.currentTarget)}>
                  {receiptCount === 1 ? "Lihat resit" : `Lihat ${receiptCount} resit`}
                </Button>
              ) : (
                <p className="mt-2.5 text-sm text-muted-foreground">Tiada resit</p>
              )}
            </DetailGroup>
            {receiptCount > 0 && <CollectionReceiptBreakdownPanel key={record.id} record={record} onViewReceipt={onViewReceipt} />}
            <DetailGroup title="Butiran lain" fields={[
              ["No.", String(number)], ["Batch", record.batch],
              ["IC Number", record.icNumber], ["Telefon", record.customerPhone],
              ["TOTAL DUE", formatCollectionOptionalAmount(record.totalDue, missing)],
              ["Billing Principal (OSP)", formatCollectionOptionalAmount(record.billingPrincipalOsp, missing)],
            ]} />
            <DetailGroup title="Padanan dan sumber" fields={[
              ["CP Status", getCollectionCpStatusLabel(record, t)], ["Aging", record.agingBucket || "-"],
              ["Match", getCollectionMatchAccuracyLabel(record.sourceMatchAccuracy, missing)],
              ["Staff Nickname", record.collectionStaffNickname], [t("common.collection.records.sourceFile"), getCollectionRecordSourceLabel(record), "wide"],
            ]} />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
