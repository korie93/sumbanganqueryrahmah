import { memo } from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

function MonitorAccessDeniedImpl() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
      <div className="mx-auto max-w-7xl">
        <Card className="glass-wrapper border-red-500/30">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <h1 className="text-xl font-semibold text-foreground">403 Access Denied</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You are not authorized to access system monitoring.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const MonitorAccessDenied = memo(MonitorAccessDeniedImpl);
