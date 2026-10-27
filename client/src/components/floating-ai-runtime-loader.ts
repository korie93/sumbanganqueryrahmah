import type { ComponentType } from "react";
import type { FloatingAIProps } from "./FloatingAI";

export type FloatingAIRuntimeModule = {
  default: ComponentType<FloatingAIProps>;
};

export function createFloatingAIRuntimeLoader(
  importRuntime: () => Promise<FloatingAIRuntimeModule> = () => import("./FloatingAI"),
  retryRuntime: () => Promise<FloatingAIRuntimeModule> = importRuntime,
) {
  let pending: Promise<FloatingAIRuntimeModule> | null = null;
  let attempted = false;

  return () => {
    if (pending) return pending;
    const importer = attempted ? retryRuntime : importRuntime;
    attempted = true;
    const request = Promise.resolve().then(importer);
    pending = request;
    void request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };
}

const importRetryRuntime = async (): Promise<FloatingAIRuntimeModule> => {
  // Native module maps remember a failed URL. A second build-owned module URL
  // permits one real retry without eval, blob URLs or unbounded cache busting.
  const entries = import.meta.glob<ComponentType<FloatingAIProps>>("./FloatingAI.tsx", {
    query: "?sqr-ai-retry",
    import: "default",
  });
  const load = entries["./FloatingAI.tsx"];
  if (!load) throw new Error("AI runtime retry is unavailable.");
  return { default: await load() };
};

export const loadFloatingAIRuntime = createFloatingAIRuntimeLoader(
  () => import("./FloatingAI"),
  importRetryRuntime,
);
