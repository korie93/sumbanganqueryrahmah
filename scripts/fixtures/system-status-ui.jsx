// Real application components and recovery hook, with synthetic HTTP supplied by
// the runner. This fixture never boots the app server or reads local credentials.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import NotFound from "../../client/src/pages/NotFound";
import Maintenance from "../../client/src/pages/Maintenance";
import { SystemStatusView } from "../../client/src/components/system-status/SystemStatusView";
import { useServiceRecovery } from "../../client/src/components/system-status/useServiceRecovery";
import { usePublicAppState } from "../../client/src/app/usePublicAppState";
import { useAppShellMaintenanceState } from "../../client/src/app/useAppShellMaintenanceState";
import "../../client/src/styles/tokens/index.css";
import "../../client/src/public-shell.css";
import "../../client/src/styles/theme/index.css";
import "../../client/src/index.css";
import "../../client/src/components/system-status/SystemStatusPage.css";

const parameters = new URLSearchParams(location.search);
const state = parameters.get("state") || "404";
const theme = parameters.get("theme") || "light";
const fixture = parameters.get("fixture") || "status";
const syntheticUser = { username: "synthetic-browser-status-only", role: "user" };
document.documentElement.classList.toggle("dark", theme === "dark");
document.documentElement.dataset.theme = theme;
window.__statusFixtureActions = [];
if (fixture === "public-maintenance") {
  const marker = document.createElement("meta");
  marker.name = "sqr-maintenance";
  marker.content = "active";
  document.head.append(marker);
  // A synthetic storage marker only; no credentials or authenticated server.
  sessionStorage.setItem("user", JSON.stringify(syntheticUser));
}

function PublicMaintenanceFixture() {
  const app = usePublicAppState();
  return <div data-fixture-current-page={app.currentPage}>{app.currentPage === "maintenance" ? <Maintenance /> : <p>Fixture page: {app.currentPage}</p>}</div>;
}

function ShellMaintenanceFixture() {
  const [currentPage, setCurrentPage] = useState("maintenance");
  useAppShellMaintenanceState({ currentPage, setCurrentPage, user: syntheticUser });
  return <div data-fixture-current-page={currentPage}>{currentPage === "maintenance" ? <Maintenance /> : <p>Fixture page: {currentPage}</p>}</div>;
}

function RecoveryFixture() {
  const recovery = useServiceRecovery(state);
  return <SystemStatusView state={recovery.state} busy={recovery.busy} feedback={recovery.feedback}
    primary={recovery.state === "restored" ? { label: "Sambung ke SQR", href: "/" }
      : { label: "Cuba Semula", onClick: () => { void recovery.check(); } }} />;
}

const fixtureRoot = createRoot(document.getElementById("root"));
window.__statusFixtureUnmount = () => fixtureRoot.unmount();
fixtureRoot.render(fixture === "public-maintenance" ? <PublicMaintenanceFixture />
  : fixture === "shell-maintenance" ? <ShellMaintenanceFixture />
  : state === "404"
  ? <NotFound isAuthenticated={parameters.get("auth") === "true"}
      onNavigateHome={() => window.__statusFixtureActions.push("home")}
      onLoginClick={() => window.__statusFixtureActions.push("login")} />
  : state === "maintenance" ? <Maintenance /> : <RecoveryFixture />);
