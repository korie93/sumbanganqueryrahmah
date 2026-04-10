import { Suspense, memo, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ClipboardList, FileText, Server } from "lucide-react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { lazyWithPreload } from "@/lib/lazy-with-preload";

const DashboardPage = lazyWithPreload(() => import("@/pages/Dashboard"));
const ActivityPage = lazyWithPreload(() => import("@/pages/Activity"));
const SystemPerformancePage = lazyWithPreload(() => import("@/pages/Monitor"));
const AnalysisPage = lazyWithPreload(() => import("@/pages/Analysis"));
const AuditLogsPage = lazyWithPreload(() => import("@/pages/AuditLogs"));

type MonitorSection = "dashboard" | "activity" | "monitor" | "analysis" | "audit";

type SystemMonitorLayoutProps = {
  showDashboard: boolean;
  showActivity: boolean;
  showSystemPerformance: boolean;
  showAnalysis: boolean;
  showAuditLogs: boolean;
  requestedSection: MonitorSection;
  onSectionChange?: ((section: MonitorSection) => void) | undefined;
  onNavigate?: ((page: string) => void) | undefined;
};

type AnalysisSectionProps = {
  onNavigate?: ((page: string) => void) | undefined;
};

export function preloadSystemMonitorSection(
  section: "dashboard" | "activity" | "monitor" | "analysis" | "audit",
) {
  switch (section) {
    case "dashboard":
      return DashboardPage.preload();
    case "activity":
      return ActivityPage.preload();
    case "analysis":
      return AnalysisPage.preload();
    case "audit":
      return AuditLogsPage.preload();
    default:
      return SystemPerformancePage.preload();
  }
}

const DashboardSection = memo(function DashboardSection() {
  return <DashboardPage />;
});

const ActivitySection = memo(function ActivitySection() {
  return <ActivityPage />;
});

const SystemPerformanceSection = memo(function SystemPerformanceSection() {
  return <SystemPerformancePage />;
});

const AnalysisSection = memo(function AnalysisSection({ onNavigate }: AnalysisSectionProps) {
  return <AnalysisPage onNavigate={onNavigate || (() => undefined)} />;
});

const AuditLogsSection = memo(function AuditLogsSection() {
  return <AuditLogsPage />;
});

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
  analysis: {
    label: "Analysis",
    icon: BarChart3,
    description: "Analytics engine and data summary",
  },
  audit: {
    label: "Audit Logs",
    icon: FileText,
    description: "Compliance and security logs",
  },
};

export default function SystemMonitorLayout({
  showDashboard,
  showActivity,
  showSystemPerformance,
  showAnalysis,
  showAuditLogs,
  requestedSection,
  onSectionChange,
  onNavigate,
}: SystemMonitorLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const shouldRenderNavigation = !isMobile || sidebarOpen;

  const availableSections = useMemo(() => {
    const sections: MonitorSection[] = [];
    if (showDashboard) sections.push("dashboard");
    if (showActivity) sections.push("activity");
    if (showSystemPerformance) sections.push("monitor");
    if (showAnalysis) sections.push("analysis");
    if (showAuditLogs) sections.push("audit");
    return sections;
  }, [showActivity, showAnalysis, showAuditLogs, showDashboard, showSystemPerformance]);

  const defaultSection = useMemo<MonitorSection>(() => {
    if (showSystemPerformance) return "monitor";
    if (showDashboard) return "dashboard";
    if (showActivity) return "activity";
    if (showAnalysis) return "analysis";
    if (showAuditLogs) return "audit";
    return "monitor";
  }, [showActivity, showAnalysis, showAuditLogs, showDashboard, showSystemPerformance]);

  const [activeSection, setActiveSection] = useState<MonitorSection>(() =>
    availableSections.includes(requestedSection) ? requestedSection : defaultSection,
  );
  const lastEmittedSectionRef = useRef<MonitorSection | null>(null);

  useEffect(() => {
    if (availableSections.length === 0) return;
    const currentAllowed = availableSections.includes(activeSection);
    if (!currentAllowed) {
      setActiveSection(defaultSection);
    }
  }, [activeSection, availableSections, defaultSection]);

  useEffect(() => {
    if (!availableSections.includes(requestedSection)) return;
    setActiveSection((prev) => (prev === requestedSection ? prev : requestedSection));
  }, [availableSections, requestedSection]);

  useEffect(() => {
    if (lastEmittedSectionRef.current === activeSection) return;
    lastEmittedSectionRef.current = activeSection;
    onSectionChange?.(activeSection);
  }, [activeSection, onSectionChange]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [activeSection]);

  if (availableSections.length === 0) {
    return (
      <div className="app-shell-min-height p-6">
        <Card className="glass-wrapper">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No System Monitor sections are available for your current role settings.
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderActiveSection = () => {
    if (activeSection === "dashboard") return <DashboardSection />;
    if (activeSection === "activity") return <ActivitySection />;
    if (activeSection === "analysis") {
      return <AnalysisSection onNavigate={onNavigate} />;
    }
    if (activeSection === "audit") return <AuditLogsSection />;
    return <SystemPerformanceSection />;
  };

  const sectionFallback = (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );

  return (
    <div className="app-shell-min-height bg-background px-4 py-4 lg:px-6">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <Card className="border-border/60 bg-background/75 shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="text-2xl">{sectionMeta[activeSection].label}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {sectionMeta[activeSection].description}
            </p>
          </CardHeader>
        </Card>

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start">
          {shouldRenderNavigation ? (
            <LazySideTabNavigation
              items={availableSections.map((section) => ({
                key: section,
                label: sectionMeta[section].label,
                icon: sectionMeta[section].icon,
                description: sectionMeta[section].description,
              }))}
              selectedKey={activeSection}
              onSelect={(key) => setActiveSection(key as MonitorSection)}
              mobileOpen={sidebarOpen}
              onMobileOpenChange={setSidebarOpen}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
              menuLabel="Sections"
              navigationLabel="System Monitor"
            />
          ) : null}

          <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-background/70 shadow-sm">
            <AppRouteErrorBoundary
              routeKey={`system-monitor:${activeSection}`}
              routeLabel={activeSection}
            >
              <Suspense fallback={sectionFallback}>{renderActiveSection()}</Suspense>
            </AppRouteErrorBoundary>
          </section>
        </div>
      </div>
    </div>
  );
}
