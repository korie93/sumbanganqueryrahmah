import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logClientError } from "@/lib/client-logger";

type PanelErrorBoundaryProps = {
  children: ReactNode;
  boundaryKey: string;
  panelLabel: string;
};

type PanelErrorBoundaryState = {
  error: Error | null;
  boundaryKey: string;
};

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      boundaryKey: props.boundaryKey,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<PanelErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logClientError(
      "Operational panel render failed",
      error,
      {
        source: "error-boundary",
        component: "PanelErrorBoundary",
        boundaryKey: this.props.boundaryKey,
        panelLabel: this.props.panelLabel,
        componentStack: errorInfo.componentStack,
      },
    );
  }

  componentDidUpdate(prevProps: PanelErrorBoundaryProps) {
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
      <div
        className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <p className="font-semibold">{this.props.panelLabel} tidak dapat dimuatkan.</p>
              <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
                Panel ini gagal dirender, tetapi bahagian lain pada halaman masih boleh digunakan.
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={this.handleRetry}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Cuba semula panel
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
