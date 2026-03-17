import { Card, CardContent } from "@/components/ui/card";
import { formatAmountRM } from "@/pages/collection/utils";

export interface CollectionSummaryTotalsProps {
  grandTotal: { totalRecords: number; totalAmount: number };
}

export function CollectionSummaryTotals({ grandTotal }: CollectionSummaryTotalsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card className="border-border/60 bg-background/60">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Grand Total Records</p>
          <p className="text-xl font-semibold">{grandTotal.totalRecords}</p>
        </CardContent>
      </Card>
      <Card className="border-border/60 bg-background/60">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Grand Total Amount</p>
          <p className="text-xl font-semibold">{formatAmountRM(grandTotal.totalAmount)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
