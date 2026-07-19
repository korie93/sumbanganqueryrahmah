import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { reportClientError } from "@/lib/client-error-telemetry";
import { logClientError } from "@/lib/client-logger";

type DashboardSectionRenderBoundaryProps = {
  children: ReactNode;
  sectionName: string;
  boundaryKey: string;
};

type DashboardSectionRenderBoundaryState = {
  error: Error | null;
  boundaryKey: string;
};

type DashboardSectionRenderFallbackProps = {
  sectionName: string;
  onRetry: () => void;
};

export function DashboardSectionRenderFallback({
  sectionName,
  onRetry,
}: DashboardSectionRenderFallbackProps) {
  return (
    <OperationalSectionCard
      className="border-destructive/30 bg-destructive/10 shadow-sm"
      contentClassName="p-4"
    >
      <div
        role="alert"
        aria-live="assertive"
        aria-label={`${sectionName} tidak dapat dimuatkan`}
        data-testid="dashboard-section-render-error"
        className="flex min-h-[180px] flex-col justify-center text-destructive"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-2">
            <p className="font-semibold">{sectionName} tidak dapat dimuatkan.</p>
            <p className="text-sm leading-6 text-destructive/90">
              Bahagian ini gagal dirender, tetapi bahagian dashboard lain masih boleh digunakan.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 border-destructive/40 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onRetry}
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Cuba lagi
            </Button>
          </div>
        </div>
      </div>
    </OperationalSectionCard>
  );
}

export class DashboardSectionRenderBoundary extends Component<
  DashboardSectionRenderBoundaryProps,
  DashboardSectionRenderBoundaryState
> {
  constructor(props: DashboardSectionRenderBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      boundaryKey: props.boundaryKey,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<DashboardSectionRenderBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logClientError("Dashboard section render failed", {
      event: "dashboard_section_render_error",
      section: this.props.sectionName,
      error,
      componentStack: errorInfo.componentStack,
    });
    reportClientError({
      source: "dashboard_section_render",
      error,
      fingerprintContext: errorInfo.componentStack,
    });
  }

  componentDidUpdate(prevProps: DashboardSectionRenderBoundaryProps) {
    if (prevProps.boundaryKey !== this.props.boundaryKey && this.state.error) {
      this.setState({
        error: null,
        boundaryKey: this.props.boundaryKey,
      });
    }
  }

  private readonly handleRetry = () => {
    this.setState({
      error: null,
      boundaryKey: this.props.boundaryKey,
    });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <DashboardSectionRenderFallback
        sectionName={this.props.sectionName}
        onRetry={this.handleRetry}
      />
    );
  }
}
