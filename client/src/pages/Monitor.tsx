import { MonitorAccessDenied } from "@/components/monitor/MonitorAccessDenied";
import { MonitorPageProvider } from "@/pages/monitor/MonitorPageContext";
import { MonitorPageShell } from "@/pages/monitor/MonitorPageSections";
import { useMonitorPageState } from "@/pages/monitor/useMonitorPageState";

export default function Monitor() {
  const monitorPageState = useMonitorPageState();

  if (monitorPageState.accessDenied) {
    return <MonitorAccessDenied />;
  }

  return (
    <MonitorPageProvider state={monitorPageState}>
      <MonitorPageShell />
    </MonitorPageProvider>
  );
}
