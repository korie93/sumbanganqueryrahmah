import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw, RotateCcw } from "lucide-react";
import { reloadAppPreservingSingleTabLock } from "@/app/single-tab-session";
import {
  resolveRouteErrorDescription,
  resolveRouteErrorTitle,
} from "@/app/route-error-boundary-utils";

type AppRouteErrorBoundaryProps = {
  children: ReactNode;
  routeKey: string;
  routeLabel?: string;
  fullscreen?: boolean;
  onNavigateHome?: () => void;
};

type AppRouteErrorBoundaryState = {
  error: Error | null;
  routeKey: string;
};

export class AppRouteErrorBoundary extends Component<
  AppRouteErrorBoundaryProps,
  AppRouteErrorBoundaryState
> {
  constructor(props: AppRouteErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      routeKey: props.routeKey,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppRouteErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App route render failed", {
      routeKey: this.props.routeKey,
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  componentDidUpdate(prevProps: AppRouteErrorBoundaryProps) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({
        error: null,
        routeKey: this.props.routeKey,
      });
    }
  }

  private handleRetry = () => {
    this.setState({ error: null, routeKey: this.props.routeKey });
  };

  private handleReload = () => {
    if (typeof window === "undefined") {
      return;
    }
    reloadAppPreservingSingleTabLock(window.location.href);
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const actionClassName =
      "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    const primaryActionClassName = `${actionClassName} border-primary bg-primary text-primary-foreground hover:bg-primary/90`;
    const secondaryActionClassName = `${actionClassName} border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground`;

    return (
      <div className={this.props.fullscreen ? "viewport-min-height bg-background" : "bg-background"}>
        <div className={this.props.fullscreen ? "flex viewport-min-height items-center justify-center p-6" : "p-6"}>
          <section className="w-full max-w-2xl rounded-xl border border-destructive/30 bg-background/95 text-card-foreground shadow-lg">
            <div className="flex flex-col space-y-3 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold leading-none tracking-tight">
                    {resolveRouteErrorTitle(this.props.routeLabel)}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {resolveRouteErrorDescription(this.state.error)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 p-6 pt-0">
              <button type="button" onClick={this.handleRetry} className={primaryActionClassName}>
                <RotateCcw className="h-4 w-4" />
                Retry Page
              </button>
              {this.props.onNavigateHome ? (
                <button
                  type="button"
                  onClick={this.props.onNavigateHome}
                  className={secondaryActionClassName}
                >
                  <Home className="h-4 w-4" />
                  Go Home
                </button>
              ) : null}
              <button type="button" onClick={this.handleReload} className={secondaryActionClassName}>
                <RefreshCw className="h-4 w-4" />
                Reload App
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }
}
