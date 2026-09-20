import { memo } from "react";
import {
  AIPage,
  CollectionReportPage,
  ForbiddenPage,
  GeneralSearchPage,
  HomePage,
  ImportPage,
  MaintenanceRoutePage,
  NotFoundPage,
  SavedPage,
  SettingsRoutePage,
  SystemMonitorLayoutPage,
  ViewerPage,
} from "@/app/lazy-pages";
import { isPageEnabled } from "@/app/monitorAccess";
import { PageSpinner } from "@/app/PageSpinner";
import type {
  AppRuntimeConfig,
  MonitorSection,
  MonitorSectionVisibility,
  TabVisibility,
  User,
} from "@/app/types";

type AppPageRendererProps = {
  user: User;
  currentPage: string;
  monitorSection: MonitorSection;
  selectedImportId?: string | undefined;
  runtimeConfig: AppRuntimeConfig;
  tabVisibility: TabVisibility;
  tabVisibilityLoaded: boolean;
  monitorVisibility: MonitorSectionVisibility;
  featureLockdown: boolean;
  systemName?: string | undefined;
  onNavigate: (page: string, importId?: string) => void;
  onMonitorSectionChange: (section: MonitorSection) => void;
};

function AppPageRendererImpl({
  user,
  currentPage,
  monitorSection,
  selectedImportId,
  runtimeConfig,
  tabVisibility,
  tabVisibilityLoaded,
  monitorVisibility,
  systemName,
  onNavigate,
  onMonitorSectionChange,
}: AppPageRendererProps) {
  if (user.role !== "superuser" && !tabVisibilityLoaded) return <PageSpinner />;
  const pageEnabled = isPageEnabled(user.role, currentPage, tabVisibility, tabVisibilityLoaded);

  if (!pageEnabled) {
    return <ForbiddenPage />;
  }

  if (["monitor", "activity", "analysis", "audit", "audit-logs", "dashboard"].includes(currentPage)
    && !monitorVisibility[monitorSection]) return <ForbiddenPage />;

  switch (currentPage) {
    case "home":
      return <HomePage onNavigate={onNavigate} userRole={user.role} tabVisibility={tabVisibility} />;
    case "import":
      return <ImportPage onNavigate={onNavigate} importUploadLimitBytes={runtimeConfig.importUploadLimitBytes} />;
    case "saved":
      return <SavedPage onNavigate={onNavigate} userRole={user.role} />;
    case "viewer":
      return (
        <ViewerPage
          onNavigate={onNavigate}
          importId={selectedImportId}
          userRole={user.role}
          viewerRowsPerPage={runtimeConfig.viewerRowsPerPage}
        />
      );
    case "general-search":
      return (
        <GeneralSearchPage
          userRole={user.role}
          searchResultLimit={runtimeConfig.searchResultLimit}
        />
      );
    case "backup":
      return <SettingsRoutePage tabVisibility={tabVisibility} initialSectionId="backup-restore" />;
    case "collection-report":
      return <CollectionReportPage />;
    case "ai":
      if (!runtimeConfig.aiEnabled) {
        return (
          <GeneralSearchPage
            userRole={user.role}
            searchResultLimit={runtimeConfig.searchResultLimit}
          />
        );
      }
      return (
        <AIPage
          timeoutMs={runtimeConfig.aiTimeoutMs}
          aiEnabled={runtimeConfig.aiEnabled}
          systemName={systemName}
        />
      );
    case "settings":
      return <SettingsRoutePage tabVisibility={tabVisibility} />;
    case "maintenance":
      return <MaintenanceRoutePage />;
    case "not-found":
      return (
        <NotFoundPage
          isAuthenticated
          homeLabel="Kembali ke Dashboard"
          onNavigateHome={() => onNavigate(user.role === "user" ? "general-search" : "home")}
          onLoginClick={() => onNavigate("home")}
        />
      );
    case "analysis":
    case "audit":
    case "audit-logs":
    case "dashboard":
    case "activity":
    case "monitor":
      return (
        <SystemMonitorLayoutPage
          showDashboard={monitorVisibility.dashboard}
          showActivity={monitorVisibility.activity}
          showSystemPerformance={monitorVisibility.monitor}
          showAnalysis={monitorVisibility.analysis}
          showAuditLogs={monitorVisibility.audit}
          requestedSection={monitorSection}
          onNavigate={onNavigate}
          onSectionChange={onMonitorSectionChange}
        />
      );
    case "forbidden":
      return <ForbiddenPage />;
    default:
      return <ForbiddenPage />;
  }
}

export const AppPageRenderer = memo(AppPageRendererImpl);
