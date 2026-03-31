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
  return (
    <div
      className={
        compact
          ? "rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
          : "rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
      }
    >
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {header}
      </dt>
      <dd className="mt-1 break-words text-sm text-foreground">{String(value ?? "-")}</dd>
    </div>
  );
}
