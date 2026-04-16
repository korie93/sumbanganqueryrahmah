import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw, RotateCcw } from "lucide-react";
import { reloadAppPreservingSingleTabLock } from "@/app/single-tab-session";
import { logClientError } from "@/lib/client-logger";
import {
  resolveRouteErrorDescription,
  resolveRouteErrorTitle,
} from "@/app/route-error-boundary-utils";
import {
  APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS,
  resolveChunkLoadRetryDelayMs,
  shouldAutoRetryChunkLoadRoute,
} from "@/app/route-error-boundary-retry-utils";
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
  autoRetryAttempt: number;
  autoRetryDelayMs: number | null;
};

export class AppRouteErrorBoundary extends Component<
  AppRouteErrorBoundaryProps,
  AppRouteErrorBoundaryState
> {
  private readonly errorCardRef = createRef<HTMLElement>();
  private autoRetryTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: AppRouteErrorBoundaryProps) {
    super(props);
    this.state = {
      error: null,
      routeKey: props.routeKey,
      autoRetryAttempt: 0,
      autoRetryDelayMs: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppRouteErrorBoundaryState> {
    return {
      error,
      autoRetryDelayMs: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logClientError(
      "App route render failed",
      error,
      {
        source: "error-boundary",
        component: "AppRouteBoundary",
        boundaryKey: this.props.routeKey,
        componentStack: errorInfo.componentStack,
      },
    );
  }

  componentDidUpdate(
    prevProps: AppRouteErrorBoundaryProps,
    prevState: AppRouteErrorBoundaryState,
  ) {
    if (prevProps.routeKey !== this.props.routeKey) {
      this.clearAutoRetryTimeout();
      if (
        this.state.error
        || this.state.routeKey !== this.props.routeKey
        || this.state.autoRetryAttempt !== 0
        || this.state.autoRetryDelayMs !== null
      ) {
        this.setState({
          error: null,
          routeKey: this.props.routeKey,
          autoRetryAttempt: 0,
          autoRetryDelayMs: null,
        });
      }
      return;
    }

    if (prevState.error && !this.state.error) {
      this.clearAutoRetryTimeout();
      if (this.state.autoRetryAttempt !== 0 || this.state.autoRetryDelayMs !== null) {
        this.setState({
          autoRetryAttempt: 0,
          autoRetryDelayMs: null,
        });
      }
      return;
    }

    if (!this.state.error) {
      return;
    }

    const shouldAutoRetry = shouldAutoRetryChunkLoadRoute(
      this.state.error,
      this.state.autoRetryAttempt,
    );

    if (shouldAutoRetry && prevState.error !== this.state.error) {
      const delayMs = resolveChunkLoadRetryDelayMs(this.state.autoRetryAttempt);
      this.scheduleAutoRetry(delayMs);
      if (this.state.autoRetryDelayMs !== delayMs) {
        this.setState({ autoRetryDelayMs: delayMs });
      }
      return;
    }

    if (!shouldAutoRetry && this.state.autoRetryDelayMs !== null) {
      this.clearAutoRetryTimeout();
      this.setState({
        autoRetryDelayMs: null,
      });
      return;
    }

    if (!shouldAutoRetry && (!prevState.error || prevState.error !== this.state.error)) {
      this.errorCardRef.current?.focus();
    }
  }

  componentWillUnmount() {
    this.clearAutoRetryTimeout();
  }

  private clearAutoRetryTimeout() {
    if (this.autoRetryTimeout == null) {
      return;
    }
    clearTimeout(this.autoRetryTimeout);
    this.autoRetryTimeout = null;
  }

  private scheduleAutoRetry(delayMs: number) {
    this.clearAutoRetryTimeout();
    this.autoRetryTimeout = setTimeout(() => {
      this.autoRetryTimeout = null;
      this.setState((currentState, props) => {
        if (!currentState.error) {
          return null;
        }
        if (!shouldAutoRetryChunkLoadRoute(currentState.error, currentState.autoRetryAttempt)) {
          return null;
        }
        if (currentState.routeKey !== props.routeKey) {
          return null;
        }

        return {
          error: null,
          routeKey: props.routeKey,
          autoRetryAttempt: currentState.autoRetryAttempt + 1,
          autoRetryDelayMs: null,
        };
      });
    }, delayMs);
  }

  private handleRetry = () => {
    this.clearAutoRetryTimeout();
    this.setState({
      error: null,
      routeKey: this.props.routeKey,
      autoRetryAttempt: 0,
      autoRetryDelayMs: null,
    });
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

    const autoRetrying = shouldAutoRetryChunkLoadRoute(
      this.state.error,
      this.state.autoRetryAttempt,
    );
    const pendingAttempt = Math.min(
      APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS,
      this.state.autoRetryAttempt + 1,
    );

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
          >
            <div className="app-route-error-boundary__content">
              <div className="app-route-error-boundary__header">
                <div className="app-route-error-boundary__icon">
                  {autoRetrying ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h2 className="app-route-error-boundary__title">
                    {autoRetrying
                      ? "Retrying This Page Automatically"
                      : resolveRouteErrorTitle(this.props.routeLabel)}
                  </h2>
                  <p className="app-route-error-boundary__description">
                    {autoRetrying
                      ? `A page bundle failed to load. Trying again automatically (${pendingAttempt}/${APP_ROUTE_CHUNK_RETRY_MAX_ATTEMPTS})${this.state.autoRetryDelayMs ? ` in ${Math.max(1, Math.ceil(this.state.autoRetryDelayMs / 1000))}s` : ""}.`
                      : resolveRouteErrorDescription(this.state.error)}
                  </p>
                </div>
              </div>
            </div>
            <div className="app-route-error-boundary__actions">
              {!autoRetrying ? (
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="app-route-error-boundary__action app-route-error-boundary__action--primary"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry Page
                </button>
              ) : null}
              {this.props.onNavigateHome ? (
                <button
                  type="button"
                  onClick={this.props.onNavigateHome}
                  className="app-route-error-boundary__action app-route-error-boundary__action--secondary"
                >
                  <Home className="h-4 w-4" />
                  Go Home
                </button>
              ) : null}
              <button
                type="button"
                onClick={this.handleReload}
                className="app-route-error-boundary__action app-route-error-boundary__action--secondary"
              >
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
