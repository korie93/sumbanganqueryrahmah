import { createContext, useContext, type ReactNode } from "react";
import type { MonitorPageState } from "@/pages/monitor/useMonitorPageState";

const MonitorPageContext = createContext<MonitorPageState | null>(null);

type MonitorPageProviderProps = {
  state: MonitorPageState;
  children: ReactNode;
};

export function MonitorPageProvider({ state, children }: MonitorPageProviderProps) {
  return <MonitorPageContext.Provider value={state}>{children}</MonitorPageContext.Provider>;
}

export function useMonitorPageContext() {
  const context = useContext(MonitorPageContext);

  if (!context) {
    throw new Error("useMonitorPageContext must be used within MonitorPageProvider.");
  }

  return context;
}
