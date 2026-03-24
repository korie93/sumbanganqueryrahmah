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
  fallbackClassName?: string;
};

function SideTabNavigationFallback({
  className,
  fallbackClassName,
  menuLabel,
  navigationLabel,
}: Pick<LazySideTabNavigationProps, "className" | "fallbackClassName" | "menuLabel" | "navigationLabel">) {
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="lg:hidden" disabled>
        <Menu className="mr-2 h-4 w-4" />
        {menuLabel || "Menu"}
      </Button>

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
          menuLabel={props.menuLabel}
          navigationLabel={props.navigationLabel}
        />
      )}
    >
      <SideTabNavigation {...props} />
    </Suspense>
  );
}
