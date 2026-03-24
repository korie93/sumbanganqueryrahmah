import { Suspense } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { AppPageRenderer } from "@/app/AppPageRenderer";
import { AppProviders } from "@/app/AppProviders";
import {
  ActivateAccountPage,
  BannedPage,
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  MaintenanceRoutePage,
  ResetPasswordPage,
} from "@/app/lazy-pages";
import { PageSpinner } from "@/app/PageSpinner";
import { useAppShellState } from "@/app/useAppShellState";
import AutoLogout from "@/components/AutoLogout";
import FloatingAI from "@/components/FloatingAI";
import Navbar from "@/components/Navbar";

function AppContent() {
  const {
    currentPage,
    featureLockdown,
    handleClientLogout,
    handleLoginSuccess,
    handleLogout,
    handleMonitorSectionChange,
    handleNavigate,
    isInitialized,
    monitorSection,
    monitorVisibility,
    runtimeConfig,
    savedCount,
    selectedImportId,
    systemName,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  } = useAppShellState();

  const navigateHome = () => {
    if (!user) {
      handleNavigate("login");
      return;
    }

    handleNavigate(user.role === "user" ? "general-search" : "home");
  };

  const renderRoutePage = (routeKey: string, node: React.ReactNode, fullscreen = true) => (
    <AppRouteErrorBoundary
      routeKey={routeKey}
      routeLabel={routeKey}
      fullscreen={fullscreen}
      onNavigateHome={navigateHome}
    >
      <Suspense fallback={<PageSpinner fullscreen={fullscreen} />}>
        {node}
      </Suspense>
    </AppRouteErrorBoundary>
  );

  if (!isInitialized) {
    return <PageSpinner fullscreen />;
  }

  if (localStorage.getItem("banned") === "1") {
    return renderRoutePage("banned", <BannedPage />);
  }

  if (!user) {
    if (currentPage === "maintenance") {
      return renderRoutePage("maintenance", <MaintenanceRoutePage />);
    }

    if (currentPage === "forgot-password") {
      return renderRoutePage("forgot-password", <ForgotPasswordPage />);
    }

    if (currentPage === "activate-account") {
      return renderRoutePage("activate-account", <ActivateAccountPage />);
    }

    if (currentPage === "reset-password") {
      return renderRoutePage("reset-password", <ResetPasswordPage />);
    }

    return renderRoutePage("login", <LoginPage onLoginSuccess={handleLoginSuccess} />);
  }

  if (user.mustChangePassword) {
    return (
      <div className="min-h-screen bg-background">
        <AutoLogout
          onClientLogout={handleClientLogout}
          onLogout={handleLogout}
          timeoutMinutes={runtimeConfig.sessionTimeoutMinutes}
          heartbeatIntervalMinutes={runtimeConfig.heartbeatIntervalMinutes}
          username={user.username}
        />
        {renderRoutePage(
          "change-password",
          <ChangePasswordPage
            forced
            username={user.username}
          />,
        )}
      </div>
    );
  }

  if (currentPage === "maintenance" && user.role === "user") {
    return renderRoutePage("maintenance", <MaintenanceRoutePage />);
  }

  return (
    <div className="min-h-screen bg-background">
      <AutoLogout
        onClientLogout={handleClientLogout}
        onLogout={handleLogout}
        timeoutMinutes={runtimeConfig.sessionTimeoutMinutes}
        heartbeatIntervalMinutes={runtimeConfig.heartbeatIntervalMinutes}
        username={user.username}
      />
      <Navbar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        userRole={user.role}
        username={user.username}
        systemName={systemName}
        savedCount={savedCount}
        tabVisibility={tabVisibility}
        featureLockdown={featureLockdown}
      />
      <AppRouteErrorBoundary
        routeKey={`${currentPage}:${monitorSection}:${selectedImportId || ""}`}
        routeLabel={currentPage}
        onNavigateHome={navigateHome}
      >
        <Suspense fallback={<PageSpinner />}>
          <main className="min-h-[calc(100vh-3.5rem)]">
            <AppPageRenderer
              user={user}
              currentPage={currentPage}
              monitorSection={monitorSection}
              selectedImportId={selectedImportId}
              runtimeConfig={runtimeConfig}
              tabVisibility={tabVisibility}
              tabVisibilityLoaded={tabVisibilityLoaded}
              monitorVisibility={monitorVisibility}
              featureLockdown={featureLockdown}
              onNavigate={handleNavigate}
              onMonitorSectionChange={handleMonitorSectionChange}
            />
          </main>
        </Suspense>
      </AppRouteErrorBoundary>
      {runtimeConfig.aiEnabled ? (
        <FloatingAI
          timeoutMs={runtimeConfig.aiTimeoutMs}
          aiEnabled={runtimeConfig.aiEnabled}
          activePage={currentPage}
        />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

export default App;
