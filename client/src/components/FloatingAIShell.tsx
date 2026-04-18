import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

type FloatingShellProps = {
  className: string;
  hidden: boolean;
  children: ReactNode;
};

type FloatingRootContainerProps = FloatingShellProps & {
  rootRef: Ref<HTMLDivElement>;
};

export function FloatingRootContainer({
  rootRef,
  className,
  hidden,
  children,
}: FloatingRootContainerProps) {
  if (hidden) {
    return (
      <div ref={rootRef} className={cn(className, "hidden")} aria-hidden="true">
        {children}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}

export function FloatingPanelShell({ className, hidden, children }: FloatingShellProps) {
  if (hidden) {
    return (
      <div className={cn(className, "hidden")} aria-hidden="true">
        {children}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
}

export function FloatingTriggerShell({ className, hidden, children }: FloatingShellProps) {
  if (hidden) {
    return (
      <div className={cn(className, "hidden")} aria-hidden="true">
        {children}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
}
