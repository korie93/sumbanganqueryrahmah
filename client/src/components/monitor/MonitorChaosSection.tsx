import { memo } from "react";
import { FlaskConical } from "lucide-react";
import { MonitorChaosControls } from "@/components/monitor/MonitorChaosControls";
import { MonitorChaosRestrictedCard } from "@/components/monitor/MonitorChaosRestrictedCard";
import { InfoHint } from "@/components/monitor/InfoHint";
import type { ChaosOption } from "@/components/monitor/monitorData";
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
}: MonitorChaosSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm">
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

      {canInjectChaos ? (
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
      ) : (
        <MonitorChaosRestrictedCard />
      )}
    </section>
  );
}

export const MonitorChaosSection = memo(MonitorChaosSectionImpl);
