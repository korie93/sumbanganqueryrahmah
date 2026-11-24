import { CollectionRecordsTranslation } from "./collection-records-translation";
import { useContext, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionRecord } from "@/lib/api";
import type { ViewCollectionReceipt } from "./types";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { formatCollectionOptionalAmount } from "./collection-coverage";
import { buildCollectionRecordRowAriaLabel } from "./collection-record-row-aria";
import { getCollectionCardNumberLabel } from "./utils";
import { CollectionRecordName } from "./CollectionRecordName";
import { CollectionRecordCheckbox } from "./CollectionSelectionCheckbox";

export function CollectionRecordCard({ record, number, lastViewed, onOpenRecord, onViewReceipt, children }: {
  record: CollectionRecord;
  number: number;
  lastViewed?: boolean;
  onOpenRecord?: ((record: CollectionRecord) => void) | undefined;
  onViewReceipt: ViewCollectionReceipt;
  children?: ReactNode;
}) {
  const t = useContext(CollectionRecordsTranslation);
  const missing = t("common.collection.records.missing");
  return (
    <article
      data-last-viewed={lastViewed ? "true" : undefined}
      aria-label={buildCollectionRecordRowAriaLabel({
        formattedAmount: formatCollectionOptionalAmount(record.amount, missing),
        formattedPaymentDate: formatIsoDateToDDMMYYYY(record.paymentDate),
        record,
        recordNumber: number,
      })}
      className="space-y-3 rounded-lg border border-border bg-card p-4 data-[last-viewed=true]:bg-muted data-[last-viewed=true]:shadow-[inset_3px_0_0_hsl(var(--primary))]"
      role="group"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <CollectionRecordCheckbox record={record} />
          <h3 className="min-w-0 break-words text-base font-semibold text-foreground">
            <CollectionRecordName record={record} number={number} onOpenRecord={onOpenRecord} onViewReceipt={onViewReceipt} />
          </h3>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <span aria-hidden="true">#{number}</span>
          <span className="sr-only">{t("common.collection.records.row", { number })}</span>
          {lastViewed ? <span className="sr-only">Last opened record</span> : null}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">{t("common.collection.records.cardNumber")}</dt>
          <dd className="wrap-anywhere tabular-nums">{getCollectionCardNumberLabel(record.cardNumber)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">{t("common.collection.records.accountNumber")}</dt>
          <dd className="wrap-anywhere tabular-nums">{record.accountNumber || "-"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Jumlah dibayar</dt>
          <dd className="wrap-anywhere font-medium tabular-nums">{formatCollectionOptionalAmount(record.amount, missing)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tarikh bayaran</dt>
          <dd className="tabular-nums">{formatIsoDateToDDMMYYYY(record.paymentDate)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 empty:hidden" data-floating-ai-avoid="true">
        {(record.receipts?.length || 0) > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 justify-center rounded-md"
            onClick={(event) => onViewReceipt(record, event.currentTarget)}
          >
            <Eye className="mr-2 h-4 w-4" />
            {(record.receipts?.length || 0) > 1 ? `View Receipt (${record.receipts.length})` : "View Receipt"}
          </Button>
        ) : null}
        {children}
      </div>
    </article>
  );
}
