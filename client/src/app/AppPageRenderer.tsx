import { memo } from "react";
import {
  AIPage,
  BackupRestorePage,
  CollectionReportPage,
  ForbiddenPage,
  GeneralSearchPage,
  HomePage,
  ImportPage,
  MaintenanceRoutePage,
  SavedPage,
  SettingsRoutePage,
  SystemMonitorLayoutPage,
  ViewerPage,
} from "@/app/lazy-pages";
import { isPageEnabled } from "@/app/monitorAccess";
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
  selectedImportId?: string;
  runtimeConfig: AppRuntimeConfig;
  tabVisibility: TabVisibility;
  tabVisibilityLoaded: boolean;
  monitorVisibility: MonitorSectionVisibility;
  featureLockdown: boolean;
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
  featureLockdown,
  onNavigate,
  onMonitorSectionChange,
}: AppPageRendererProps) {
  const pageEnabled = isPageEnabled(user.role, currentPage, tabVisibility, tabVisibilityLoaded);

  if (!pageEnabled) {
    if (featureLockdown) {
      return (
        <GeneralSearchPage
          userRole={user.role}
          searchResultLimit={runtimeConfig.searchResultLimit}
        />
      );
    }
    if (currentPage === "monitor") {
      return <ForbiddenPage />;
    }
    return user.role === "user" ? (
      <GeneralSearchPage
        userRole={user.role}
        searchResultLimit={runtimeConfig.searchResultLimit}
      />
    ) : (
      <HomePage onNavigate={onNavigate} userRole={user.role} tabVisibility={tabVisibility} />
    );
  }

  switch (currentPage) {
    case "home":
      return <HomePage onNavigate={onNavigate} userRole={user.role} tabVisibility={tabVisibility} />;
    case "import":
      return <ImportPage onNavigate={onNavigate} />;
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
      return <BackupRestorePage userRole={user.role} />;
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
      return <AIPage timeoutMs={runtimeConfig.aiTimeoutMs} aiEnabled={runtimeConfig.aiEnabled} />;
    case "settings":
      return <SettingsRoutePage />;
    case "maintenance":
      return <MaintenanceRoutePage />;
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
      return user.role === "user" ? (
        <GeneralSearchPage
          userRole={user.role}
          searchResultLimit={runtimeConfig.searchResultLimit}
        />
      ) : (
        <HomePage onNavigate={onNavigate} userRole={user.role} tabVisibility={tabVisibility} />
      );
  }
}

export const AppPageRenderer = memo(AppPageRendererImpl);
