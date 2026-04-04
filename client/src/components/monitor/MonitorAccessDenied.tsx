import { memo } from "react";
import { ShieldAlert } from "lucide-react";
import { OperationalPage, OperationalSectionCard } from "@/components/layout/OperationalPage";

function MonitorAccessDeniedImpl() {
  return (
    <OperationalPage width="content">
      <OperationalSectionCard
        title="403 Access Denied"
        description="You are not authorized to access system monitoring."
        className="border-red-500/30"
        contentClassName="flex flex-col items-center gap-3 py-8 text-center"
      >
        <ShieldAlert className="h-8 w-8 text-red-500" />
      </OperationalSectionCard>
    </OperationalPage>
  );
}

export const MonitorAccessDenied = memo(MonitorAccessDeniedImpl);
