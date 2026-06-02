import { Badge } from "@/components/ui/badge";
import {
  COLLECTION_DAILY_RESULT_LEGEND_ITEMS,
  COLLECTION_DAILY_STATUS_CODE_LEGEND_ITEMS,
  type CollectionDailyCalendarLegendItem,
} from "@/pages/collection/collection-daily-calendar-legend-utils";

type CollectionDailyCalendarLegendProps = {
  isMobile: boolean;
};

function StatusCodeBadge({ item }: { item: CollectionDailyCalendarLegendItem }) {
  return (
    <Badge
      variant="outline"
      className={`collection-daily-legend-badge inline-flex items-center gap-1.5 ${item.className} hover:bg-current/0`}
      title={`${item.code ? `${item.code} - ` : ""}${item.detail}`}
    >
      {item.code ? <span className="font-semibold">{item.code}</span> : null}
      <span>{item.label}</span>
    </Badge>
  );
}

export function CollectionDailyCalendarLegend({ isMobile }: CollectionDailyCalendarLegendProps) {
  if (isMobile) {
    return (
      <div
        className="collection-daily-legend space-y-3"
        data-testid="collection-daily-legend"
        aria-label="Collection daily calendar legend"
      >
        <div className="flex flex-wrap gap-2">
          {COLLECTION_DAILY_RESULT_LEGEND_ITEMS.map((item) => (
            <Badge
              key={item.label}
              variant="outline"
              className={`collection-daily-legend-badge ${item.className} hover:bg-current/0`}
              title={item.detail}
            >
              {item.label}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Daily status and leave type codes">
          {COLLECTION_DAILY_STATUS_CODE_LEGEND_ITEMS.map((item) => (
            <StatusCodeBadge key={item.code ?? item.label} item={item} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Kad harian tunjuk angka penting dahulu. Kod seperti AL, MC, atau OFF ikut status
          nickname yang dipilih sahaja.
        </p>
      </div>
    );
  }

  return (
    <section
      className="collection-daily-legend space-y-3 text-xs"
      data-testid="collection-daily-legend"
      aria-label="Collection daily calendar legend"
    >
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {COLLECTION_DAILY_RESULT_LEGEND_ITEMS.map((item) => (
          <div
            key={item.label}
            className={`collection-daily-legend-item flex items-center gap-2 rounded-xl border px-3 py-2 ${item.className}`}
            title={item.detail}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${item.dotClassName}`} aria-hidden="true" />
            <span>{item.detail}</span>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-label-lg text-muted-foreground">
          Daily status codes
        </p>
        <div className="flex flex-wrap gap-2" aria-label="Daily status and leave type codes">
          {COLLECTION_DAILY_STATUS_CODE_LEGEND_ITEMS.map((item) => (
            <StatusCodeBadge key={item.code ?? item.label} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
