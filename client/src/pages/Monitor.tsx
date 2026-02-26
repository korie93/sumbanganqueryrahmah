import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, CircleHelp, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MetricPanel, type MetricStatus, type MetricTrend } from "@/components/monitor/MetricPanel";
import { TimeSeriesChart } from "@/components/monitor/TimeSeriesChart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

const getTrend = (values: number[]): MetricTrend => {
  if (values.length < 2) return "neutral";
  const prev = values[values.length - 2];
  const current = values[values.length - 1];
  if (current > prev) return "up";
  if (current < prev) return "down";
  return "neutral";
};

const getStatus = (value: number, warning: number, critical: number, inverse = false): MetricStatus => {
  if (!Number.isFinite(value)) return "warning";
  if (!inverse) {
    if (value >= critical) return "critical";
    if (value >= warning) return "warning";
    return "good";
  }
  if (value <= critical) return "critical";
  if (value <= warning) return "warning";
  return "good";
};

function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="note"
          className="inline-flex rounded-sm text-muted-foreground transition hover:text-foreground"
          aria-label="Description"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-xs">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function Monitor() {
  const [alertsOpen, setAlertsOpen] = useState(true);
  const { isLoading, snapshot, history, alerts, accessDenied, hasNetworkFailure, lastUpdated } = useSystemMetrics();

  const scoreStatus = useMemo(() => {
    if (snapshot.score >= 85) return "good";
    if (snapshot.score >= 60) return "warning";
    return "critical";
  }, [snapshot.score]);

  const modeBadgeClass = useMemo(() => {
    if (snapshot.mode === "NORMAL") return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    if (snapshot.mode === "DEGRADED") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    return "bg-red-500/15 text-red-500 border-red-500/30";
  }, [snapshot.mode]);

  const metricGroups = useMemo(
    () => [
      {
        title: "Infrastructure",
        description: "Core runtime capacity and node responsiveness.",
        items: [
          {
            label: "CPU",
            value: snapshot.cpuPercent,
            unit: "%",
            description: "Processor utilization across active workers.",
            status: getStatus(snapshot.cpuPercent, 70, 85),
            history: history.cpuPercent.map((p) => p.value),
          },
          {
            label: "RAM",
            value: snapshot.ramPercent,
            unit: "%",
            description: "Estimated memory consumption used by runtime processes.",
            status: getStatus(snapshot.ramPercent, 75, 90),
            history: history.ramPercent.map((p) => p.value),
          },
          {
            label: "Event Loop Lag",
            value: snapshot.eventLoopLagMs,
            unit: "ms",
            description: "Delay between scheduled and actual event-loop execution.",
            status: getStatus(snapshot.eventLoopLagMs, 80, 150),
            history: history.eventLoopLagMs.map((p) => p.value),
          },
          {
            label: "Worker Count",
            value: snapshot.workerCount,
            unit: "",
            description: "Current active worker processes handling requests.",
            status: getStatus(snapshot.workerCount, Math.max(1, snapshot.maxWorkers - 1), snapshot.maxWorkers),
            history: history.workerCount.map((p) => p.value),
            decimals: 0,
          },
        ],
      },
      {
        title: "Application",
        description: "Request throughput, latency behavior, and request pressure.",
        items: [
          {
            label: "Requests / Sec",
            value: snapshot.requestsPerSec,
            unit: "rps",
            description: "Incoming request throughput per second.",
            status: getStatus(snapshot.requestsPerSec, 80, 140),
            history: history.requestsPerSec.map((p) => p.value),
          },
          {
            label: "p95 Latency",
            value: snapshot.p95LatencyMs,
            unit: "ms",
            description: "95th percentile response time for recent traffic.",
            status: getStatus(snapshot.p95LatencyMs, 450, 900),
            history: history.p95LatencyMs.map((p) => p.value),
          },
          {
            label: "Error Rate",
            value: snapshot.errorRate,
            unit: "%",
            description: "Estimated percentage of failed application operations.",
            status: getStatus(snapshot.errorRate, 2, 5),
            history: history.errorRate.map((p) => p.value),
          },
          {
            label: "Active Requests",
            value: snapshot.activeRequests,
            unit: "",
            description: "Number of requests currently being processed.",
            status: getStatus(snapshot.activeRequests, 80, 130),
            history: history.activeRequests.map((p) => p.value),
            decimals: 0,
          },
        ],
      },
      {
        title: "Database",
        description: "Database timing, query pressure, and connection health.",
        items: [
          {
            label: "Avg Query Time",
            value: snapshot.avgQueryTimeMs,
            unit: "ms",
            description: "Average time spent by database operations.",
            status: getStatus(snapshot.avgQueryTimeMs, 300, 900),
            history: history.avgQueryTimeMs.map((p) => p.value),
          },
          {
            label: "Slow Queries",
            value: snapshot.slowQueryCount,
            unit: "",
            description: "Count of queries exceeding slow-query threshold.",
            status: getStatus(snapshot.slowQueryCount, 1, 3),
            history: history.slowQueryCount.map((p) => p.value),
            decimals: 0,
          },
          {
            label: "Connections",
            value: snapshot.connections,
            unit: "",
            description: "Current database connections in use and waiting.",
            status: getStatus(snapshot.connections, 12, 20),
            history: history.connections.map((p) => p.value),
            decimals: 0,
          },
        ],
      },
      {
        title: "AI",
        description: "AI service response performance and queue stability.",
        items: [
          {
            label: "AI Latency",
            value: snapshot.aiLatencyMs,
            unit: "ms",
            description: "Average AI processing response duration.",
            status: getStatus(snapshot.aiLatencyMs, 600, 1200),
            history: history.aiLatencyMs.map((p) => p.value),
          },
          {
            label: "Queue Size",
            value: snapshot.queueSize,
            unit: "",
            description: "Pending AI-related tasks waiting for execution.",
            status: getStatus(snapshot.queueSize, 4, 8),
            history: history.queueSize.map((p) => p.value),
            decimals: 0,
          },
          {
            label: "Fail Rate",
            value: snapshot.aiFailRate,
            unit: "%",
            description: "Percentage of AI operations ending in failure.",
            status: getStatus(snapshot.aiFailRate, 2, 5),
            history: history.aiFailRate.map((p) => p.value),
          },
        ],
      },
    ],
    [history, snapshot],
  );

  const chartSeries = useMemo(
    () => [
      {
        title: "CPU %",
        description: "Rolling CPU utilization trend for runtime workers.",
        color: "#f59e0b",
        unit: "%",
        data: history.cpuPercent,
      },
      {
        title: "RAM %",
        description: "Rolling memory consumption percentage trend.",
        color: "#3b82f6",
        unit: "%",
        data: history.ramPercent,
      },
      {
        title: "p95 Latency",
        description: "Rolling 95th percentile latency trend.",
        color: "#64748b",
        unit: "ms",
        data: history.p95LatencyMs,
      },
      {
        title: "Error Rate",
        description: "Rolling failure-rate trend across system operations.",
        color: "#ef4444",
        unit: "%",
        data: history.errorRate,
      },
      {
        title: "DB Latency",
        description: "Rolling database latency trend.",
        color: "#8b5cf6",
        unit: "ms",
        data: history.avgQueryTimeMs,
      },
      {
        title: "AI Latency",
        description: "Rolling AI service latency trend.",
        color: "#14b8a6",
        unit: "ms",
        data: history.aiLatencyMs,
      },
    ],
    [history],
  );

  if (accessDenied) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-background p-6">
        <div className="mx-auto max-w-7xl">
          <Card className="glass-wrapper border-red-500/30">
            <CardContent className="p-8 text-center">
              <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-red-500" />
              <h1 className="text-xl font-semibold text-foreground">403 Access Denied</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You are not authorized to access system monitoring.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {snapshot.mode !== "NORMAL" ? (
          <Card className="border-red-500/30 bg-red-500/10">
            <CardContent className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              System is currently in {snapshot.mode} mode. Performance safeguards are active.
            </CardContent>
          </Card>
        ) : null}

        {hasNetworkFailure ? (
          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardContent className="p-3 text-sm text-amber-700 dark:text-amber-400">
              Partial telemetry unavailable due to network or endpoint failure. Showing last known values.
            </CardContent>
          </Card>
        ) : null}

        <section className="glass-wrapper p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Executive View</p>
                <InfoHint text="High-level health summary for fast executive review." />
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-foreground">System Monitor</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Premium operational summary blending business visibility and technical diagnostics.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    scoreStatus === "good"
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-500"
                      : scoreStatus === "warning"
                        ? "border-amber-500/30 bg-amber-500/15 text-amber-500"
                        : "border-red-500/30 bg-red-500/15 text-red-500"
                  }
                >
                  Health Status
                </Badge>
                <InfoHint text="Overall system health classification based on current telemetry score." />
                <Badge variant="outline" className={modeBadgeClass}>
                  {snapshot.mode}
                </Badge>
                <InfoHint text="Current protection mode driven by runtime pressure and safety rules." />
              </div>
            </div>
            <div className="text-left lg:text-right">
              <div className="flex items-center gap-2 lg:justify-end">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Performance Score</p>
                <InfoHint text="Composite score (0-100) summarizing load, latency, and failure pressure." />
              </div>
              <p className="text-[56px] font-semibold leading-none text-foreground">{snapshot.score.toFixed(0)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/60 bg-background/45">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">System Mode</p>
                  <InfoHint text="Operational state: NORMAL, DEGRADED, or PROTECTION." />
                </div>
                <p className="mt-2 text-2xl font-semibold">{snapshot.mode}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-background/45">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Bottleneck Type</p>
                  <InfoHint text="Primary pressure source currently limiting performance." />
                </div>
                <p className="mt-2 text-2xl font-semibold">{snapshot.bottleneckType}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-background/45">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Worker Count</p>
                  <InfoHint text="Active workers versus configured worker capacity." />
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {snapshot.workerCount} / {snapshot.maxWorkers}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-background/45">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Active Alert Count</p>
                  <InfoHint text="Number of currently open alerts generated by monitor rules." />
                </div>
                <p className="mt-2 text-2xl font-semibold">{snapshot.activeAlertCount}</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Key Metrics</h2>
              <InfoHint text="KPI panels grouped by layer: Infrastructure, Application, Database, and AI." />
            </div>
            <p className="text-sm text-muted-foreground">
              Each metric includes current value, status color, trend direction, and mini sparkline.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            {metricGroups.map((group) => (
              <Card key={group.title} className="border-border/60 bg-background/35 backdrop-blur-sm">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                      <InfoHint text={group.description} />
                    </div>
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  </div>
                  {group.items.map((metric) => (
                    <MetricPanel
                      key={`${group.title}-${metric.label}`}
                      label={metric.label}
                      value={metric.value}
                      unit={metric.unit}
                      description={metric.description}
                      trend={getTrend(metric.history)}
                      status={metric.status}
                      history={metric.history}
                      decimals={metric.decimals ?? 1}
                    />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
            <Card className="border-border/60 bg-background/35 backdrop-blur-sm">
              <CardContent className="p-4">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-1 text-left"
                    data-testid="monitor-alerts-toggle"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Active Alerts
                      <InfoHint text="Live alerts generated from monitor thresholds. Critical alerts indicate urgent action." />
                    </span>
                    {alertsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </CollapsibleTrigger>
                <p className="mt-2 text-xs text-muted-foreground">
                  Severity, message, and timestamp refresh automatically via polling.
                </p>
                <CollapsibleContent className="mt-3 space-y-2">
                  {alerts.length === 0 ? (
                    <p className="rounded-lg border border-border/60 bg-background/45 p-3 text-sm text-muted-foreground">
                      No active alerts.
                    </p>
                  ) : (
                    alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`rounded-lg border p-3 ${
                          alert.severity === "CRITICAL"
                            ? "border-red-500/40 bg-red-500/10"
                            : "border-border/60 bg-background/45"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge
                            variant={alert.severity === "CRITICAL" ? "destructive" : "outline"}
                            className={alert.severity === "CRITICAL" ? "font-semibold" : ""}
                          >
                            {alert.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(alert.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-foreground">{alert.message}</p>
                        {alert.source ? <p className="mt-1 text-xs text-muted-foreground">Source: {alert.source}</p> : null}
                      </div>
                    ))
                  )}
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        </section>

        <section className="rounded-2xl border border-border/60 bg-slate-200/40 p-4 dark:bg-slate-900/60">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Technical DevOps View</h2>
              <InfoHint text="Rolling 60-point technical charts for deeper diagnostics and trend analysis." />
            </div>
            <p className="text-sm text-muted-foreground">
              Designed for operators to detect instability, latency spikes, and capacity pressure quickly.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {chartSeries.map((chart) => (
              <TimeSeriesChart
                key={chart.title}
                title={chart.title}
                description={chart.description}
                color={chart.color}
                unit={chart.unit}
                data={chart.data}
              />
            ))}
          </div>
        </section>

        <p className="text-right text-xs text-muted-foreground">
          {isLoading ? "Loading..." : `Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "-"}`}
        </p>
      </div>
    </div>
  );
}
