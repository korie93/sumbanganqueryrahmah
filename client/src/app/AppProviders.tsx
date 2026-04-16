import { Suspense, type ReactNode } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ToastLiveRegion } from "@/components/ToastLiveRegion";
import { TooltipProvider } from "@/components/ui/tooltip";

const Toaster = lazyWithPreload(() =>
  import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })),
);

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TooltipProvider>
      <ToastLiveRegion />
      <OfflineIndicator />
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
      {children}
    </TooltipProvider>
  );
}
