import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";

function MonitorChaosRestrictedCardImpl() {
  return (
    <Card className="border-border/60 bg-background/45">
      <CardContent className="p-4 text-sm text-muted-foreground">
        Chaos injection controls are restricted to admin and superuser. You can still observe resulting effects in charts and alerts.
      </CardContent>
    </Card>
  );
}

export const MonitorChaosRestrictedCard = memo(MonitorChaosRestrictedCardImpl);
