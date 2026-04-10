import { Badge } from "@/components/ui/badge";
import { getMonitorSummaryToneClass } from "@/components/monitor/MonitorDeferredSection";

export type MonitorSummaryFact = {
  label: string;
  value: string;
  tone: "stable" | "watch" | "attention";
};

export function renderMonitorSummaryBadges(
  facts: MonitorSummaryFact[],
  className = "rounded-full px-2.5 py-0.5 text-[10px]",
) {
  return facts.map((fact) => (
    <Badge
      key={fact.label}
      variant="outline"
      className={`${className} ${getMonitorSummaryToneClass(fact.tone)}`}
    >
      {fact.label} {fact.value}
    </Badge>
  ));
}
