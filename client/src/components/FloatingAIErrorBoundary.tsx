import { Component, type ErrorInfo, type ReactNode } from "react";
import { BotOff, RotateCcw } from "lucide-react";
import { logClientError } from "@/lib/client-logger";

type FloatingAIErrorBoundaryProps = {
  children: ReactNode;
  boundaryKey: string;
};

type FloatingAIErrorBoundaryState = {
  error: Error | null;
  boundaryKey: string;
};

export class FloatingAIErrorBoundary extends Component<
  FloatingAIErrorBoundaryProps,
  FloatingAIErrorBoundaryState
> {
  constructor(props: FloatingAIErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      boundaryKey: props.boundaryKey,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<FloatingAIErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logClientError(
      "Floating AI shell render failed",
      error,
      {
        source: "error-boundary",
        component: "FloatingAI",
        boundaryKey: this.props.boundaryKey,
        componentStack: errorInfo.componentStack,
      },
    );
  }

  componentDidUpdate(prevProps: FloatingAIErrorBoundaryProps) {
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
      <div className="pointer-events-none fixed bottom-4 right-4 z-[var(--z-floating-ai)] max-w-[min(20rem,calc(100vw-2rem))]">
        <div className="pointer-events-auto rounded-2xl border border-amber-400/30 bg-amber-500/12 px-4 py-3 text-sm text-amber-950 shadow-lg backdrop-blur-sm dark:text-amber-100">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/18">
              <BotOff className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-1">
                <p className="font-semibold">Pembantu AI tidak tersedia buat sementara waktu.</p>
                <p className="text-xs text-amber-900/85 dark:text-amber-100/80">
                  Ciri AI gagal dimuatkan, tetapi halaman lain masih boleh digunakan seperti biasa.
                </p>
              </div>
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-500/35 bg-white/70 px-3 py-2 text-xs font-medium text-amber-950 transition-colors hover:bg-white dark:bg-slate-950/55 dark:text-amber-50 dark:hover:bg-slate-950/75"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Cuba semula AI
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
