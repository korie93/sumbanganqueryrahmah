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
  const groupAriaLabelProps = header ? { "aria-label": header } : {};
  const displayValue = formatViewerCellValue(value);

  return (
    <div
      role="group"
      {...groupAriaLabelProps}
      className={
        compact
          ? "rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
          : "rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
      }
    >
      <p className="text-2xs font-medium uppercase tracking-label-sm text-muted-foreground">
        {header}
      </p>
      <p className="mt-1 break-words text-sm text-foreground">{displayValue}</p>
    </div>
  );
}
