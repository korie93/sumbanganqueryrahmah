import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className={this.props.fullscreen ? "min-h-screen bg-background" : "bg-background"}>
        <div className={this.props.fullscreen ? "flex min-h-screen items-center justify-center p-6" : "p-6"}>
          <Card className="w-full max-w-2xl border-destructive/30 bg-background/95 shadow-lg">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    {resolveRouteErrorTitle(this.props.routeLabel)}
                  </CardTitle>
                  <CardDescription>
                    {resolveRouteErrorDescription(this.state.error)}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button type="button" onClick={this.handleRetry}>
                <RotateCcw className="h-4 w-4" />
                Retry Page
              </Button>
              {this.props.onNavigateHome ? (
                <Button type="button" variant="outline" onClick={this.props.onNavigateHome}>
                  <Home className="h-4 w-4" />
                  Go Home
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4" />
                Reload App
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
}
