import { memo } from "react";
import { CHAOS_OPTIONS, type ChaosOption } from "@/components/monitor/monitorData";
import { InfoHint } from "@/components/monitor/InfoHint";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ChaosType } from "@/lib/api";

type MonitorChaosControlsProps = {
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

function MonitorChaosControlsImpl({
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
}: MonitorChaosControlsProps) {
  return (
    <Card className="border-border/60 bg-background/45">
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Scenario Type</p>
              <InfoHint text="Select the fault profile to inject into intelligence simulation stream." />
            </div>
            <Select value={chaosType} onValueChange={(value) => onChaosTypeChange(value as ChaosType)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose scenario" />
              </SelectTrigger>
              <SelectContent>
                {CHAOS_OPTIONS.map((option) => (
                  <SelectItem key={option.type} value={option.type}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{selectedChaosProfile.description}</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label
                htmlFor="monitor-chaos-magnitude"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Magnitude
              </Label>
              <InfoHint text="Controls intensity of the selected chaos scenario." />
            </div>
            <Input
              id="monitor-chaos-magnitude"
              name="monitorChaosMagnitude"
              type="number"
              inputMode="decimal"
              value={chaosMagnitude}
              onChange={(event) => onChaosMagnitudeChange(event.target.value)}
              placeholder={String(selectedChaosProfile.defaultMagnitude)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label
                htmlFor="monitor-chaos-duration"
                className="text-xs uppercase tracking-wide text-muted-foreground"
              >
                Duration (ms)
              </Label>
              <InfoHint text="Controls how long the injected scenario remains active before expiry." />
            </div>
            <Input
              id="monitor-chaos-duration"
              name="monitorChaosDurationMs"
              type="number"
              inputMode="numeric"
              value={chaosDurationMs}
              onChange={(event) => onChaosDurationChange(event.target.value)}
              placeholder={String(selectedChaosProfile.defaultDurationMs)}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={chaosLoading}
            onClick={() => {
              void onSubmit();
            }}
          >
            {chaosLoading ? "Injecting..." : "Inject Chaos Event"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Admin and superuser only. Backend permission is still enforced.
          </span>
        </div>

        {lastChaosMessage ? (
          <p className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
            {lastChaosMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export const MonitorChaosControls = memo(MonitorChaosControlsImpl);
