import { Suspense, lazy, type ReactNode } from "react";
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
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
      {children}
    </TooltipProvider>
  );
}
