import {
  OperationalMetric,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";

type ViewerContentSummaryStripProps = {
  rowsCount: number;
  totalRows: number;
  pageStart: number;
  pageEnd: number;
  visibleHeadersCount: number;
  headersCount: number;
  selectedRowCount: number;
};

export function ViewerContentSummaryStrip({
  rowsCount,
  totalRows,
  pageStart,
  pageEnd,
  visibleHeadersCount,
  headersCount,
  selectedRowCount,
}: ViewerContentSummaryStripProps) {
  return (
    <OperationalSummaryStrip>
      <OperationalMetric
        label="Page rows"
        value={rowsCount}
        supporting={totalRows > 0 ? `Rows ${pageStart}-${pageEnd} of ${totalRows}` : "No rows loaded"}
      />
      <OperationalMetric
        label="Visible columns"
        value={`${visibleHeadersCount}/${headersCount || visibleHeadersCount}`}
        supporting="Current table layout"
      />
      <OperationalMetric
        label="Selected rows"
        value={selectedRowCount}
        supporting={selectedRowCount > 0 ? "Ready for focused export" : "No rows selected"}
      />
    </OperationalSummaryStrip>
  );
}
