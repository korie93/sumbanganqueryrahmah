import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AIProvider } from "@/context/AIContext";
import { queryClient } from "@/lib/queryClient";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AIProvider>
        <TooltipProvider>
          <Toaster />
          {children}
        </TooltipProvider>
      </AIProvider>
    </QueryClientProvider>
  );
}
