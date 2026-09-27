import { formatViewerCellValue } from "@/pages/viewer/viewer-row-aria";

interface ViewerDataFieldCardProps {
  header: string;
  value: unknown;
  compact?: boolean;
}

export function ViewerDataFieldCard({
  header,
  value,
  compact = false,
}: ViewerDataFieldCardProps) {
  const displayValue = formatViewerCellValue(value);

  return (
    <div
      className={
        compact
          ? "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-1.5"
          : "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2"
      }
    >
      <dt className="break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {header}
      </dt>
      <dd className="min-w-0 break-words text-sm text-foreground [overflow-wrap:anywhere]">{displayValue}</dd>
    </div>
  );
}
