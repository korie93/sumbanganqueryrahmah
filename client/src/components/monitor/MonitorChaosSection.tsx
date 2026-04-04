import { memo, useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { MonitorChaosControls } from "@/components/monitor/MonitorChaosControls";
import { MonitorChaosRestrictedCard } from "@/components/monitor/MonitorChaosRestrictedCard";
import { InfoHint } from "@/components/monitor/InfoHint";
import type { ChaosOption } from "@/components/monitor/monitorData";
import { Badge } from "@/components/ui/badge";
import type { ChaosType } from "@/lib/api";

type MonitorChaosSectionProps = {
  canInjectChaos: boolean;
  chaosType: ChaosType;
  selectedChaosProfile: ChaosOption;
  chaosMagnitude: string;
  chaosDurationMs: string;
  chaosLoading: boolean;
  lastChaosMessage: string | null;
  onChaosTypeChange: (nextType: ChaosType) => void;
  onChaosMagnitudeChange: (value: string) => void;
  onChaosDurationChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  embedded?: boolean;
};

function MonitorChaosSectionImpl({
  canInjectChaos,
  chaosType,
  selectedChaosProfile,
  chaosMagnitude,
  chaosDurationMs,
  chaosLoading,
  lastChaosMessage,
  onChaosTypeChange,
  onChaosMagnitudeChange,
  onChaosDurationChange,
  onSubmit,
  embedded = false,
}: MonitorChaosSectionProps) {
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <section className={embedded ? "space-y-4" : "space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm"}>
      {embedded ? null : (
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Chaos Lab</h2>
            <InfoHint text="Internal non-destructive fault injection tool for resilience testing in monitor workflow." />
          </div>
          <p className="text-sm text-muted-foreground">
            Use controlled chaos scenarios to validate alerting, stability governance, and response behavior.
          </p>
        </div>
      )}

      {canInjectChaos ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              onClick={() => setControlsOpen((previous) => !previous)}
              aria-expanded={controlsOpen}
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Scenario controls</span>
                  <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                    {selectedChaosProfile.label}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                    {chaosDurationMs || String(selectedChaosProfile.defaultDurationMs)}ms
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open the fault-injection form only when you want to configure a scenario. Hidden by default to keep monitor lighter.
                </p>
              </div>
              <span className="shrink-0 pt-1 text-muted-foreground">
                {controlsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>
          </div>

          {controlsOpen ? (
            <MonitorChaosControls
              chaosType={chaosType}
              selectedChaosProfile={selectedChaosProfile}
              chaosMagnitude={chaosMagnitude}
              chaosDurationMs={chaosDurationMs}
              chaosLoading={chaosLoading}
              lastChaosMessage={lastChaosMessage}
              onChaosTypeChange={onChaosTypeChange}
              onChaosMagnitudeChange={onChaosMagnitudeChange}
              onChaosDurationChange={onChaosDurationChange}
              onSubmit={onSubmit}
            />
          ) : null}

          {!controlsOpen && lastChaosMessage ? (
            <p className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
              {lastChaosMessage}
            </p>
          ) : null}
        </div>
      ) : (
        <MonitorChaosRestrictedCard />
      )}
    </section>
  );
}

export const MonitorChaosSection = memo(MonitorChaosSectionImpl);
