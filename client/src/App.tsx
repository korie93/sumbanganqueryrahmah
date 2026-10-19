import { lazy, Suspense, useCallback, useEffect, useRef } from "react";
import { AppRouteErrorBoundary } from "@/app/AppRouteErrorBoundary";
import { applyDocumentMetadata, resolveDocumentMetadata } from "@/app/document-metadata";
import {
  ActivateAccountPage,
  BannedPage,
  ForgotPasswordPage,
  LandingPage,
  LoginPage,
  MaintenanceRoutePage,
  NotFoundPage,
  ResetPasswordPage,
} from "@/app/lazy-pages";
import { PageSpinner } from "@/app/PageSpinner";
import { AuthenticatedAppEntry } from "@/app/authenticated-entry-lazy";
import { isBannedSessionFlagSet } from "@/lib/auth-session";
import { scheduleIdlePreload } from "@/lib/lazy-with-preload";
import LandingRouteFallback from "@/pages/LandingRouteFallback";
import { usePublicAppState } from "@/app/usePublicAppState";
import { resolveAuthenticatedRoleHomePage } from "@/app/role-home-page";
import { SQR_BRAND_ASSETS } from "@shared/brand-assets";

// Public routes must not download the protected app or this authenticated gate.
const SingleActiveTabGate = lazy(() => import("@/components/auth/SingleActiveTabGate"));

function markAppReadyAndRemoveBootShell() {
  document.documentElement.classList.add("app-ready");
  document.body.classList.add("app-ready");
  document.getElementById("boot-shell")?.remove();
}

function focusMainContent(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const mainContent = document.getElementById("main-content");
  if (!mainContent) {
    return;
  }
  mainContent.focus({ preventScroll: true });
  mainContent.scrollIntoView({ block: "start" });
  // AUDIT-FIX [M8]: hash-only replaceState avoids router churn; analytics should ignore this skip-link focus URL update.
  window.history.replaceState(null, "", "#main-content");
}

function AppReadySignal({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") {
      return;
    }

    const frameId = window.requestAnimationFrame(markAppReadyAndRemoveBootShell);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [ready]);

  return null;
}

function AppContent() {
  const {
    currentPage,
    handleAuthenticatedLogout,
    handleBannedRetryLogin,
    handleBannedSessionDetected,
    handleLoginSuccess,
    isInitialized,
    monitorSection,
    systemName,
    handlePublicNavigate,
    handleVerifiedAccountChanged,
    handleVerifiedSession,
    handleRejectedTabSession,
    user,
  } = usePublicAppState();
  const lastActivatedAccountScope = useRef("");

  const validateBeforeActivation = useCallback(async (signal: AbortSignal) => {
    const { validateTabSession } = await import("@/app/single-tab-session-validation");
    if (signal.aborted) return false;
    const result = await validateTabSession(signal);
    if (signal.aborted) return false;
    if (result.status === "unauthenticated") {
      handleRejectedTabSession(result.banned);
      return false;
    }
    if (result.status !== "verified") return false;
    if (!user?.id || result.user.id !== user.id) {
      handleVerifiedAccountChanged(result.user);
      return false;
    }
    const accountScope = JSON.stringify([result.user.id, result.user.role]);
    if (lastActivatedAccountScope.current && lastActivatedAccountScope.current !== accountScope) {
      // This document may previously have owned another account before a
      // pagehide/rebind/logout. Never reuse its in-memory protected queries.
      // Only import the protected cache after owning the new, verified ID.
      const { queryClient } = await import("@/lib/queryClient");
      if (signal.aborted) return false;
      queryClient.clear();
    }
    lastActivatedAccountScope.current = accountScope;
    // Pass the fresh role/profile to the protected tree as well as the ID.
    handleVerifiedSession(result.user);
    return true;
  }, [handleRejectedTabSession, handleVerifiedAccountChanged, handleVerifiedSession, user?.id]);

  useEffect(() => {
    applyDocumentMetadata(
      resolveDocumentMetadata({
        currentPage,
        monitorSection,
        systemName,
        user,
      }),
    );
  }, [currentPage, monitorSection, systemName, user]);

  useEffect(() => {
    let cancelIdlePreload: (() => void) | undefined;
    if (isInitialized && !user && currentPage === "forgot-password") {
      cancelIdlePreload = scheduleIdlePreload(() => {
        LoginPage.preload();
      }, 700);
    }

    return cancelIdlePreload;
  }, [currentPage, isInitialized, user]);

  const renderRoutePage = (
    routeKey: string,
    node: React.ReactNode,
    fullscreen = true,
    fallback: React.ReactNode = <PageSpinner fullscreen={fullscreen} />,
  ) => (
    <AppRouteErrorBoundary
      routeKey={routeKey}
      routeLabel={routeKey}
      fullscreen={fullscreen}
      onNavigateHome={() => handlePublicNavigate("home")}
    >
      <Suspense fallback={fallback}>
        {node}
      </Suspense>
    </AppRouteErrorBoundary>
  );

  const handleAuthenticatedNavigateHome = () => {
    handlePublicNavigate(resolveAuthenticatedRoleHomePage(user?.role));
  };

  const readySignal = <AppReadySignal ready={isInitialized} />;

  if (!isInitialized) {
    return (
      <>
        {readySignal}
        <PageSpinner fullscreen />
      </>
    );
  }

  if (isBannedSessionFlagSet()) {
    return (
      <>
        {readySignal}
        {renderRoutePage("banned", <BannedPage onRetryLogin={handleBannedRetryLogin} />)}
      </>
    );
  }

  if (currentPage === "not-found") {
    return (
      <>
        {readySignal}
        {renderRoutePage(
          "not-found",
          <NotFoundPage
            isAuthenticated={Boolean(user)}
            homeLabel={user ? "Kembali ke Dashboard" : "Kembali ke Halaman Utama"}
            onNavigateHome={user ? handleAuthenticatedNavigateHome : () => handlePublicNavigate("home")}
            onLoginClick={() => handlePublicNavigate("login")}
          />,
        )}
      </>
    );
  }

  if (!user) {
    if (currentPage === "home") {
      return (
        <>
          {readySignal}
          {renderRoutePage(
            "home",
            <LandingPage onLoginClick={() => handlePublicNavigate("login")} />,
            true,
            <LandingRouteFallback onLoginClick={() => handlePublicNavigate("login")} />,
          )}
        </>
      );
    }

    if (currentPage === "maintenance") {
      return (
        <>
          {readySignal}
          {renderRoutePage("maintenance", <MaintenanceRoutePage />)}
        </>
      );
    }

    if (currentPage === "forgot-password") {
      return (
        <>
          {readySignal}
          {renderRoutePage(
            "forgot-password",
            (
              <ForgotPasswordPage
                onBackToHome={() => handlePublicNavigate("home")}
                onBackToLogin={() => handlePublicNavigate("login")}
              />
            ),
          )}
        </>
      );
    }

    if (currentPage === "activate-account") {
      return (
        <>
          {readySignal}
          {renderRoutePage(
            "activate-account",
            <ActivateAccountPage onBackToLogin={() => handlePublicNavigate("login")} />,
          )}
        </>
      );
    }

    if (currentPage === "reset-password") {
      return (
        <>
          {readySignal}
          {renderRoutePage(
            "reset-password",
            (
              <ResetPasswordPage
                onBackToHome={() => handlePublicNavigate("home")}
                onBackToLogin={() => handlePublicNavigate("login")}
              />
            ),
          )}
        </>
      );
    }

    return (
      <>
        {readySignal}
        {renderRoutePage(
          "login",
          (
            <LoginPage
              onBanned={handleBannedSessionDetected}
              onForgotPasswordClick={() => handlePublicNavigate("forgot-password")}
              onLandingClick={() => handlePublicNavigate("home")}
              onLoginSuccess={handleLoginSuccess}
            />
          ),
        )}
      </>
    );
  }

  return (
    <>
      {readySignal}
      <Suspense fallback={<PageSpinner fullscreen />}>
        <SingleActiveTabGate
          accountId={user.id ?? ""}
          logoSrc={SQR_BRAND_ASSETS.transparentIcon}
          onBeforeActivate={validateBeforeActivation}
        >
          <AppRouteErrorBoundary
            routeKey={`authenticated-entry:${currentPage}:${monitorSection}`}
            routeLabel={currentPage}
            fullscreen
            onNavigateHome={handleAuthenticatedNavigateHome}
          >
            <Suspense fallback={<PageSpinner fullscreen />}>
              <AuthenticatedAppEntry
                initialUser={user}
                initialPage={currentPage}
                initialMonitorSection={monitorSection}
                onLoggedOut={handleAuthenticatedLogout}
                onAccountChanged={handleVerifiedAccountChanged}
              />
            </Suspense>
          </AppRouteErrorBoundary>
        </SingleActiveTabGate>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <>
      <a
        className="skip-to-main-link"
        href="#main-content"
        onClick={focusMainContent}
      >
        Langkau ke kandungan utama
      </a>
      <AppContent />
    </>
  );
}

export default App;
