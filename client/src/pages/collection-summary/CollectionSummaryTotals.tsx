import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { formatAmountRM } from "@/pages/collection/utils";
import "./CollectionSummaryTotals.css";

export interface CollectionSummaryTotalsProps {
  grandTotal: { totalRecords: number; totalAmount: number };
}

export function CollectionSummaryTotals({ grandTotal }: CollectionSummaryTotalsProps) {
  return (
    <OperationalSummaryStrip className="collection-summary-totals">
      <OperationalMetric label="Grand Total Records" value={<span data-floating-ai-avoid="true">{grandTotal.totalRecords}</span>} />
      <OperationalMetric
        label="Grand Total Amount"
        value={<span data-floating-ai-avoid="true">{formatAmountRM(grandTotal.totalAmount)}</span>}
        tone="success"
      />
    </OperationalSummaryStrip>
  );
}
