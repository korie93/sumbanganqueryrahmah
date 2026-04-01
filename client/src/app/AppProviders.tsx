import { Suspense, lazy, type ReactNode, useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

const Toaster = lazy(() =>
  import("@/components/ui/toaster").then((module) => ({ default: module.Toaster })),
);

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const [showToaster, setShowToaster] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowToaster(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <TooltipProvider>
      {showToaster ? (
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
      ) : null}
      {children}
    </TooltipProvider>
  );
}
