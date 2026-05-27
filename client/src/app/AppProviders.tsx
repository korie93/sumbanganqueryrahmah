import { Suspense, lazy, type ReactNode } from "react";
import { LazySuspenseFallback } from "@/components/LazySuspenseFallback";
import { TooltipProvider } from "@/components/ui/tooltip";

const Toaster = lazy(() =>
  import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })),
);

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <TooltipProvider>
      <Suspense fallback={<LazySuspenseFallback label="Loading notifications..." />}>
        <Toaster />
      </Suspense>
      {children}
    </TooltipProvider>
  );
}
