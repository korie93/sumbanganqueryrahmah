import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw, RotateCcw } from "lucide-react";
import { reloadAppPreservingSingleTabLock } from "@/app/single-tab-session";
import { reportClientError } from "@/lib/client-error-telemetry";
import { logClientError } from "@/lib/client-logger";
import {
  resolveRouteErrorDescription,
  resolveRouteErrorTitle,
} from "@/app/route-error-boundary-utils";
import "./app-shell-bootstrap.css";

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
  private readonly errorCardRef = createRef<HTMLElement>();

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
    logClientError("App route render failed", {
      routeKey: this.props.routeKey,
      error,
      componentStack: errorInfo.componentStack,
    });
    reportClientError({
      source: "route_render",
      error,
      fingerprintContext: errorInfo.componentStack,
    });
  }

  componentDidUpdate(
    prevProps: AppRouteErrorBoundaryProps,
    prevState: AppRouteErrorBoundaryState,
  ) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({
        error: null,
        routeKey: this.props.routeKey,
      });
      return;
    }

    if (!prevState.error && this.state.error) {
      this.errorCardRef.current?.focus();
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

    return (
      <div
        className={`app-route-error-boundary ${this.props.fullscreen ? "app-route-error-boundary--fullscreen" : ""}`}
      >
        <div
          className={`app-route-error-boundary__shell ${this.props.fullscreen ? "app-route-error-boundary__shell--fullscreen" : ""}`}
        >
          <section
            ref={this.errorCardRef}
            className="app-route-error-boundary__card"
            tabIndex={-1}
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            aria-labelledby="app-route-error-boundary-title"
            aria-describedby="app-route-error-boundary-description"
          >
            <div className="app-route-error-boundary__content">
              <div className="app-route-error-boundary__header">
                <div className="app-route-error-boundary__icon">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="app-route-error-boundary-title" className="app-route-error-boundary__title">
                    {resolveRouteErrorTitle(this.props.routeLabel)}
                  </h2>
                  <p id="app-route-error-boundary-description" className="app-route-error-boundary__description">
                    {resolveRouteErrorDescription(this.state.error)}
                  </p>
                </div>
              </div>
            </div>
            <div className="app-route-error-boundary__actions">
              <button
                type="button"
                onClick={this.handleRetry}
                className="app-route-error-boundary__action app-route-error-boundary__action--primary"
              >
                <RotateCcw className="h-4 w-4" />
                Cuba Semula
              </button>
              {this.props.onNavigateHome ? (
                <button
                  type="button"
                  onClick={this.props.onNavigateHome}
                  className="app-route-error-boundary__action app-route-error-boundary__action--secondary"
                >
                  <Home className="h-4 w-4" />
                  Ke Laman Utama
                </button>
              ) : null}
              <button
                type="button"
                onClick={this.handleReload}
                className="app-route-error-boundary__action app-route-error-boundary__action--secondary"
              >
                <RefreshCw className="h-4 w-4" />
                Muat Semula Aplikasi
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }
}
