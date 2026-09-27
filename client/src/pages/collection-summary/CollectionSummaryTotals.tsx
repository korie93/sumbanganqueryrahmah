import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { formatAmountRM } from "@/pages/collection/utils";

export interface CollectionSummaryTotalsProps {
  grandTotal: { totalRecords: number; totalAmount: number };
}

export function CollectionSummaryTotals({ grandTotal }: CollectionSummaryTotalsProps) {
  return (
    <OperationalSummaryStrip className="grid grid-cols-2 gap-3">
      <OperationalMetric label="Grand Total Records" value={grandTotal.totalRecords} />
      <OperationalMetric
        label="Grand Total Amount"
        value={formatAmountRM(grandTotal.totalAmount)}
        tone="success"
      />
    </OperationalSummaryStrip>
  );
}
