import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/monitor/InfoHint";
import type { IntelligenceExplainPayload } from "@/lib/api";

type MonitorInsightsPanelsProps = {
  intelligence: IntelligenceExplainPayload;
  governanceClass: string;
};

function MonitorInsightsPanelsImpl({
  intelligence,
  governanceClass,
}: MonitorInsightsPanelsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="border-border/60 bg-background/45">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Governance State</p>
            <InfoHint text="State machine gate controlling whether autonomous actions can be executed." />
          </div>
          <Badge variant="outline" className={governanceClass}>
            {intelligence.governanceState}
          </Badge>
          <div className="pt-1 text-xs text-muted-foreground">
            Decision path follows cooldown, consensus, and fail-safe safeguards.
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-background/45">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Chosen Strategy</p>
            <InfoHint text="Winning strategy selected from conservative, aggressive, and adaptive competition." />
          </div>
          <p className="text-lg font-semibold text-foreground">{intelligence.chosenStrategy.strategy}</p>
          <p className="text-xs text-muted-foreground">
            Action: <span className="font-medium text-foreground">{intelligence.chosenStrategy.recommendedAction}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Confidence: <span className="font-medium text-foreground">{(intelligence.chosenStrategy.confidenceScore * 100).toFixed(1)}%</span>
          </p>
          <p className="text-xs text-muted-foreground">{intelligence.chosenStrategy.reason}</p>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-background/45">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Decision Reason</p>
            <InfoHint text="Merged reason from strategy selection and control-engine execution guard." />
          </div>
          <p className="text-sm leading-relaxed text-foreground">{intelligence.decisionReason}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export const MonitorInsightsPanels = memo(MonitorInsightsPanelsImpl);
