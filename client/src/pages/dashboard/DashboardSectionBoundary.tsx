import type { ReactNode } from "react";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";

type DashboardSectionBoundaryProps = {
  boundaryKey: string;
  children: ReactNode;
  panelLabel: string;
};

export function DashboardSectionBoundary({
  boundaryKey,
  children,
  panelLabel,
}: DashboardSectionBoundaryProps) {
  return (
    <PanelErrorBoundary boundaryKey={boundaryKey} panelLabel={panelLabel}>
      {children}
    </PanelErrorBoundary>
  );
}
