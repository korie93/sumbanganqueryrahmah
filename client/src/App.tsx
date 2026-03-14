import { Suspense } from "react";
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

  if (!isInitialized) {
    return <PageSpinner fullscreen />;
  }

  if (localStorage.getItem("banned") === "1") {
    return (
      <Suspense fallback={<PageSpinner fullscreen />}>
        <BannedPage />
      </Suspense>
    );
  }

  if (!user) {
    if (currentPage === "maintenance") {
      return (
        <Suspense fallback={<PageSpinner fullscreen />}>
          <MaintenanceRoutePage />
        </Suspense>
      );
    }

    if (currentPage === "forgot-password") {
      return (
        <Suspense fallback={<PageSpinner fullscreen />}>
          <ForgotPasswordPage />
        </Suspense>
      );
    }

    if (currentPage === "activate-account") {
      return (
        <Suspense fallback={<PageSpinner fullscreen />}>
          <ActivateAccountPage />
        </Suspense>
      );
    }

    if (currentPage === "reset-password") {
      return (
        <Suspense fallback={<PageSpinner fullscreen />}>
          <ResetPasswordPage />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<PageSpinner fullscreen />}>
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }

  if (user.mustChangePassword) {
    return (
      <div className="min-h-screen bg-background">
        <AutoLogout
          onLogout={handleLogout}
          timeoutMinutes={runtimeConfig.sessionTimeoutMinutes}
          heartbeatIntervalMinutes={runtimeConfig.heartbeatIntervalMinutes}
          username={user.username}
        />
        <Suspense fallback={<PageSpinner fullscreen />}>
          <ChangePasswordPage
            forced
            username={user.username}
          />
        </Suspense>
      </div>
    );
  }

  if (currentPage === "maintenance" && user.role === "user") {
    return (
      <Suspense fallback={<PageSpinner fullscreen />}>
        <MaintenanceRoutePage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AutoLogout
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
