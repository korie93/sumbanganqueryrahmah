import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logClientError } from "@/lib/client-logger";

type FloatingAIChatErrorBoundaryProps = {
  children: ReactNode;
  boundaryKey: string;
};

type FloatingAIChatErrorBoundaryState = {
  error: Error | null;
  boundaryKey: string;
};

export class FloatingAIChatErrorBoundary extends Component<
  FloatingAIChatErrorBoundaryProps,
  FloatingAIChatErrorBoundaryState
> {
  constructor(props: FloatingAIChatErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      boundaryKey: props.boundaryKey,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<FloatingAIChatErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logClientError(
      "Floating AI chat render failed",
      error,
      {
        source: "error-boundary",
        component: "AIChat",
        boundaryKey: this.props.boundaryKey,
        componentStack: errorInfo.componentStack,
      },
    );
  }

  componentDidUpdate(prevProps: FloatingAIChatErrorBoundaryProps) {
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
      <div className="flex h-full items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-center text-sm text-amber-950 dark:text-amber-100">
        <div className="max-w-sm space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">AI chat tidak dapat dimuatkan.</p>
            <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
              Panel ini gagal dirender, tetapi halaman anda masih selamat digunakan.
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={this.handleRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Cuba Semula
          </Button>
        </div>
      </div>
    );
  }
}
