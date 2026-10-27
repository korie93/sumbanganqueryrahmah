import { useEffect, useRef, useState, type ComponentType } from "react";
import { useLocation } from "wouter";
import type { FloatingAIProps } from "./FloatingAI";
import FloatingAIIdleLauncher from "./FloatingAIIdleLauncher";
import { loadFloatingAIRuntime } from "./floating-ai-runtime-loader";

type FloatingAILauncherProps = Omit<FloatingAIProps, "initiallyOpen">;
type LoadedRuntime = {
  Component: ComponentType<FloatingAIProps>;
  activatedOnRoute: string;
};

export default function FloatingAILauncher(props: FloatingAILauncherProps) {
  const [location] = useLocation();
  const routeKey = `${props.activePage}:${location}`;
  const [runtime, setRuntime] = useState<LoadedRuntime | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const requestId = useRef(0);
  const loading = useRef(false);
  const currentOwner = useRef({ routeKey, enabled: props.aiEnabled });
  currentOwner.current = { routeKey, enabled: props.aiEnabled };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
    };
  }, []);

  useEffect(() => {
    requestId.current += 1;
    loading.current = false;
    setIsLoading(false);
    setError(false);
  }, [routeKey, props.aiEnabled]);

  const activate = () => {
    if (loading.current || !props.aiEnabled || runtime) return;
    const id = ++requestId.current;
    const owner = routeKey;
    const ownsActivation = () => mounted.current
      && id === requestId.current
      && owner === currentOwner.current.routeKey
      && currentOwner.current.enabled;
    loading.current = true;
    setIsLoading(true);
    setError(false);

    void loadFloatingAIRuntime().then((module) => {
      if (!ownsActivation()) return;
      // Keep the loaded runtime mounted after first activation so minimizing
      // or navigating preserves the existing in-flight request lifecycle.
      setRuntime({ Component: module.default, activatedOnRoute: owner });
    }).catch(() => {
      if (ownsActivation()) setError(true);
    }).finally(() => {
      if (!ownsActivation()) return;
      loading.current = false;
      setIsLoading(false);
    });
  };

  if (!props.aiEnabled || props.activePage === "ai") return null;
  if (runtime) {
    const Runtime = runtime.Component;
    // Navigation and module readiness can be batched into the same commit.
    // Only the route that requested activation may seed the panel as open.
    return <Runtime {...props} initiallyOpen={runtime.activatedOnRoute === routeKey} />;
  }

  return (
    <FloatingAIIdleLauncher
      activePage={props.activePage}
      systemName={props.systemName}
      isLoading={isLoading}
      error={error}
      onActivate={activate}
    />
  );
}
