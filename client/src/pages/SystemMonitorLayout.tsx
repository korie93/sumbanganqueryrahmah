import { memo, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, ClipboardList, Menu, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import DashboardPage from "@/pages/Dashboard";
import ActivityPage from "@/pages/Activity";
import SystemPerformancePage from "@/pages/Monitor";

type MonitorSection = "dashboard" | "activity" | "monitor";

type SystemMonitorLayoutProps = {
  showDashboard: boolean;
  showActivity: boolean;
  showSystemPerformance: boolean;
  requestedSection: MonitorSection;
  onSectionChange?: (section: MonitorSection) => void;
};

const sectionMeta: Record<
  MonitorSection,
  { label: string; icon: typeof BarChart3; description: string }
> = {
  dashboard: {
    label: "Dashboard Login",
    icon: BarChart3,
    description: "Login and analytics overview",
  },
  activity: {
    label: "Activity",
    icon: ClipboardList,
    description: "Live user activity monitoring",
  },
  monitor: {
    label: "System Performance",
    icon: Server,
    description: "Runtime, infra and diagnostics",
  },
};

const DashboardContent = memo(function DashboardContent() {
  return <DashboardPage />;
});

const ActivityContent = memo(function ActivityContent() {
  return <ActivityPage />;
});

const MonitorContent = memo(function MonitorContent() {
  return <SystemPerformancePage />;
});

export default function SystemMonitorLayout({
  showDashboard,
  showActivity,
  showSystemPerformance,
  requestedSection,
  onSectionChange,
}: SystemMonitorLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const availableSections = useMemo(() => {
    const sections: MonitorSection[] = [];
    if (showDashboard) sections.push("dashboard");
    if (showActivity) sections.push("activity");
    if (showSystemPerformance) sections.push("monitor");
    return sections;
  }, [showActivity, showDashboard, showSystemPerformance]);

  const defaultSection = useMemo<MonitorSection>(() => {
    if (showSystemPerformance) return "monitor";
    if (showDashboard) return "dashboard";
    if (showActivity) return "activity";
    return "monitor";
  }, [showActivity, showDashboard, showSystemPerformance]);

  const [activeSection, setActiveSection] = useState<MonitorSection>(defaultSection);
  const [mountedSections, setMountedSections] = useState<Record<MonitorSection, boolean>>({
    dashboard: defaultSection === "dashboard",
    activity: defaultSection === "activity",
    monitor: defaultSection === "monitor",
  });

  useEffect(() => {
    if (availableSections.length === 0) return;
    const currentAllowed = availableSections.includes(activeSection);
    if (!currentAllowed) {
      setActiveSection(defaultSection);
    }
  }, [activeSection, availableSections, defaultSection]);

  useEffect(() => {
    if (!availableSections.includes(requestedSection)) return;
    setActiveSection(requestedSection);
  }, [availableSections, requestedSection]);

  useEffect(() => {
    setMountedSections((prev) => (prev[activeSection] ? prev : { ...prev, [activeSection]: true }));
    onSectionChange?.(activeSection);
  }, [activeSection, onSectionChange]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [activeSection]);

  if (availableSections.length === 0) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] p-6">
        <Card className="glass-wrapper">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No System Monitor sections are available for your current role settings.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 md:p-6">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-3 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-2"
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            <Menu className="h-4 w-4" />
            Sections
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <aside
            className={cn(
              "w-full rounded-2xl border border-border/60 bg-slate-200/50 p-3 backdrop-blur-sm dark:bg-slate-900/70 md:w-[240px] md:shrink-0",
              sidebarOpen ? "block" : "hidden md:block",
            )}
          >
            <div className="mb-2 px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
              System Monitor
            </div>
            <div className="space-y-2">
              {availableSections.map((section) => {
                const meta = sectionMeta[section];
                const Icon = meta.icon;
                const active = activeSection === section;
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() => setActiveSection(section)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary/40 bg-primary/15 text-foreground"
                        : "border-border/60 bg-background/50 text-muted-foreground hover:bg-background/75 hover:text-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4" />
                      {meta.label}
                    </span>
                    <p className="mt-1 text-xs">{meta.description}</p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-background/35 backdrop-blur-sm">
            <div className={cn(activeSection === "dashboard" ? "block" : "hidden")}>
              {mountedSections.dashboard ? <DashboardContent /> : null}
            </div>
            <div className={cn(activeSection === "activity" ? "block" : "hidden")}>
              {mountedSections.activity ? <ActivityContent /> : null}
            </div>
            <div className={cn(activeSection === "monitor" ? "block" : "hidden")}>
              {mountedSections.monitor ? <MonitorContent /> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
