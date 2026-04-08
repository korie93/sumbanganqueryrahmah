import { Suspense, lazy } from "react";
import { Menu } from "lucide-react";
import type { SideTabNavigationProps } from "@/components/navigation/SideTabNavigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SideTabNavigation = lazy(() =>
  import("@/components/navigation/SideTabNavigation").then((module) => ({
    default: module.SideTabNavigation,
  })),
);

type LazySideTabNavigationProps = SideTabNavigationProps & {
  fallbackClassName?: string | undefined;
};

function SideTabNavigationFallback({
  className,
  fallbackClassName,
  hideMobileTrigger,
  mobileOpen,
  menuLabel,
  navigationLabel,
}: Pick<
  LazySideTabNavigationProps,
  "className" | "fallbackClassName" | "hideMobileTrigger" | "menuLabel" | "mobileOpen" | "navigationLabel"
>) {
  return (
    <>
      {!hideMobileTrigger ? (
        <Button type="button" variant="outline" size="sm" className="lg:hidden" disabled>
          <Menu className="mr-2 h-4 w-4" />
          {menuLabel || "Menu"}
        </Button>
      ) : null}

      <aside
        className={cn(
          "sticky top-4 hidden w-72 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-background/70 p-2 shadow-sm lg:block",
          className,
          fallbackClassName,
        )}
        aria-label={`${navigationLabel || "Navigation"} loading`}
      >
        <div className="mb-2 flex justify-end">
          <div className="h-8 w-8 rounded-md bg-muted/70" aria-hidden="true" />
        </div>
        <div className="space-y-2" role="status" aria-live="polite">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/55 px-3 py-3"
            >
              <div className="h-7 w-7 shrink-0 rounded-md bg-muted/70" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3.5 w-24 rounded bg-muted/70" aria-hidden="true" />
                <div className="h-3 w-40 rounded bg-muted/50" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {mobileOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden" aria-hidden="true" />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-[290px] border-r border-border/70 bg-background p-3 shadow-xl lg:hidden"
            aria-label={`${navigationLabel || "Navigation"} loading`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{navigationLabel}</p>
              <div className="h-8 w-8 rounded-md bg-muted/70" aria-hidden="true" />
            </div>

            <div className="space-y-1" role="status" aria-live="polite">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={`mobile-${item}`}
                  className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/55 px-3 py-3"
                >
                  <div className="h-7 w-7 shrink-0 rounded-md bg-muted/70" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3.5 w-28 rounded bg-muted/70" aria-hidden="true" />
                    <div className="h-3 w-44 rounded bg-muted/50" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

export function LazySideTabNavigation({
  fallbackClassName,
  ...props
}: LazySideTabNavigationProps) {
  return (
    <Suspense
      fallback={(
        <SideTabNavigationFallback
          className={props.className}
          fallbackClassName={fallbackClassName}
          hideMobileTrigger={props.hideMobileTrigger}
          mobileOpen={props.mobileOpen}
          menuLabel={props.menuLabel}
          navigationLabel={props.navigationLabel}
        />
      )}
    >
      <SideTabNavigation {...props} />
    </Suspense>
  );
}
