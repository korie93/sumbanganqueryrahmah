import { Suspense, memo, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronDown, ClipboardList, FileText, Server } from "lucide-react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import {
  ActivityMonitorSectionPage,
  AnalysisMonitorSectionPage,
  AuditLogsMonitorSectionPage,
  DashboardMonitorSectionPage,
  preloadSystemMonitorSection,
  SystemPerformanceMonitorSectionPage,
} from "@/app/system-monitor-lazy-sections";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAriaCurrentPageProps } from "@/lib/aria-state-props";
import "./dashboard/dashboard-workspace.css";

type MonitorSection = "dashboard" | "activity" | "monitor" | "analysis" | "audit";

type SystemMonitorLayoutProps = {
  showDashboard: boolean;
  showActivity: boolean;
  showSystemPerformance: boolean;
  showAnalysis: boolean;
  showAuditLogs: boolean;
  requestedSection: MonitorSection;
  onSectionChange?: ((section: MonitorSection) => void) | undefined;
  onNavigate?: ((page: string, importId?: string) => void) | undefined;
};

type AnalysisSectionProps = {
  onNavigate?: ((page: string, importId?: string) => void) | undefined;
};

export { preloadSystemMonitorSection };

const DashboardSection = memo(function DashboardSection() {
  return <DashboardMonitorSectionPage />;
});

const ActivitySection = memo(function ActivitySection() {
  return <ActivityMonitorSectionPage />;
});

const SystemPerformanceSection = memo(function SystemPerformanceSection() {
  return <SystemPerformanceMonitorSectionPage />;
});

const AnalysisSection = memo(function AnalysisSection({ onNavigate }: AnalysisSectionProps) {
  return <AnalysisMonitorSectionPage onNavigate={onNavigate || (() => undefined)} />;
});

const AuditLogsSection = memo(function AuditLogsSection() {
  return <AuditLogsMonitorSectionPage />;
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

export function SystemMonitorNavigation({
  activeSection,
  availableSections,
  onSelect,
}: {
  activeSection: MonitorSection;
  availableSections: MonitorSection[];
  onSelect: (section: MonitorSection) => void;
}) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const desktopCurrentRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();
  const ActiveIcon = sectionMeta[activeSection].icon;

  useEffect(() => {
    if (!isMobile) setSectionsOpen(false);
  }, [isMobile]);

  return (
    <>
      <nav className="monitor-context-navigation" aria-label="System Monitor">
        {availableSections.map((section) => {
          const Icon = sectionMeta[section].icon;
          return (
            <Button key={section} ref={activeSection === section ? desktopCurrentRef : undefined}
              type="button" variant="ghost" size="sm" className="monitor-context-button"
              {...getAriaCurrentPageProps(activeSection === section)} onClick={() => onSelect(section)}>
              <Icon className="h-4 w-4" aria-hidden="true" />{sectionMeta[section].label}
            </Button>
          );
        })}
      </nav>
      <div className="monitor-mobile-navigation">
        <Sheet open={sectionsOpen} onOpenChange={setSectionsOpen}>
          <SheetTrigger asChild>
            <Button ref={triggerRef} variant="ghost" className="h-11 w-full justify-between px-3"
              aria-label={`Change System Monitor section, current: ${sectionMeta[activeSection].label}`}
              data-testid="button-monitor-sections">
              <span className="flex min-w-0 items-center gap-2">
                <ActiveIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{sectionMeta[activeSection].label}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" data-testid="monitor-sections-sheet"
            className="data-[state=closed]:duration-200 data-[state=open]:duration-200 motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = isMobile ? triggerRef.current : desktopCurrentRef.current;
              if (target?.isConnected) target.focus({ preventScroll: true });
            }}>
            <SheetHeader className="pr-8 text-left">
              <SheetTitle>System Monitor</SheetTitle>
              <SheetDescription>Choose a section for your current role.</SheetDescription>
            </SheetHeader>
            <nav aria-label="System Monitor sections" className="mt-4 space-y-1 pb-[var(--safe-area-inset-bottom)]">
              {availableSections.map((section) => {
                const Icon = sectionMeta[section].icon;
                return (
                  <Button key={section} type="button" variant="ghost"
                    className="monitor-context-button h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left"
                    {...getAriaCurrentPageProps(activeSection === section)}
                    onClick={() => { onSelect(section); setSectionsOpen(false); }}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm">{sectionMeta[section].label}</span>
                      <span className="block text-xs font-normal text-muted-foreground">{sectionMeta[section].description}</span>
                    </span>
                  </Button>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

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
  const lastEmittedSectionRef = useRef<MonitorSection | null>(requestedSection);

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
    <div className="monitor-workspace app-shell-min-height">
      <div className="mx-auto max-w-[1680px]">
        <SystemMonitorNavigation activeSection={activeSection} availableSections={availableSections} onSelect={setActiveSection} />
          <section className="min-w-0">
            <AppRouteErrorBoundary
              routeKey={`system-monitor:${activeSection}`}
              routeLabel={activeSection}
            >
              <Suspense fallback={sectionFallback}>{renderActiveSection()}</Suspense>
            </AppRouteErrorBoundary>
          </section>
      </div>
    </div>
  );
}
