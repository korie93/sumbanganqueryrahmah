import { Badge } from "@/components/ui/badge";

type CollectionDailyCalendarLegendProps = {
  isMobile: boolean;
};

const legendItems = [
  {
    label: "Red: No collection",
    detail: "No collection",
    className: "border-rose-300/60 bg-rose-50/70 text-rose-700 dark:bg-rose-950/25 dark:text-rose-200",
    dotClassName: "bg-rose-500",
  },
  {
    label: "Yellow: Below target",
    detail: "Collection recorded but daily target not achieved",
    className: "border-amber-300/60 bg-amber-50/70 text-amber-700 dark:bg-amber-950/25 dark:text-amber-200",
    dotClassName: "bg-amber-500",
  },
  {
    label: "Green: Target achieved",
    detail: "Daily target achieved",
    className: "border-green-300/60 bg-green-50/70 text-green-700 dark:bg-green-950/25 dark:text-green-200",
    dotClassName: "bg-green-500",
  },
  {
    label: "Grey: Holiday",
    detail: "Holiday / Leave / OFF",
    className: "border-slate-300/60 bg-slate-100/80 text-slate-700 dark:bg-slate-900/55 dark:text-slate-200",
    dotClassName: "bg-slate-500",
  },
] as const;

export function CollectionDailyCalendarLegend({ isMobile }: CollectionDailyCalendarLegendProps) {
  if (isMobile) {
    return (
      <div className="collection-daily-legend space-y-2" data-testid="collection-daily-legend">
        <div className="flex flex-wrap gap-2">
          {legendItems.map((item) => (
            <Badge
              key={item.label}
              className={`collection-daily-legend-badge ${item.className} hover:bg-current/0`}
            >
              {item.label}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Kad harian tunjuk angka penting dahulu. Tap View details untuk semak transaksi.
        </p>
      </div>
    );
  }

  return (
    <div
      className="collection-daily-legend grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4"
      data-testid="collection-daily-legend"
    >
      {legendItems.map((item) => (
        <div
          key={item.label}
          className={`collection-daily-legend-item flex items-center gap-2 rounded-xl border px-3 py-2 ${item.className}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${item.dotClassName}`} />
          <span>{item.detail}</span>
        </div>
      ))}
    </div>
  );
}
