import type { CSSProperties, ReactNode, Ref } from "react";
import type { FloatingAiLayout } from "@/components/floating-ai-layout-types";

type FloatingRootContainerProps = {
  rootRef: Ref<HTMLDivElement>;
  className: string;
  hidden: boolean;
  children: ReactNode;
};

/**
 * Renders the shared floating root container component used across SQR screens.
 */
export function FloatingRootContainer({
  rootRef,
  className,
  hidden,
  children,
}: FloatingRootContainerProps) {
  return (
    <div ref={rootRef} className={className} hidden={hidden}>
      {children}
    </div>
  );
}

type FloatingPanelShellProps = {
  className: string;
  hidden: boolean;
  children: ReactNode;
};

/**
 * Renders the shared floating panel shell component used across SQR screens.
 */
export function FloatingPanelShell({
  className,
  hidden,
  children,
}: FloatingPanelShellProps) {
  return (
    <div hidden={hidden} className={className}>
      {children}
    </div>
  );
}

type FloatingTriggerShellProps = {
  className: string;
  hidden: boolean;
  children: ReactNode;
  placement?: FloatingAiLayout["trigger"] | undefined;
};

/**
 * Renders the shared floating trigger shell component used across SQR screens.
 */
export function FloatingTriggerShell({
  className,
  hidden,
  children,
  placement,
}: FloatingTriggerShellProps) {
  const placementStyle = placement ? {
    "--floating-ai-trigger-left": placement.left === null ? "auto" : `${placement.left}px`,
    "--floating-ai-trigger-right": placement.right === null ? "auto" : `${placement.right}px`,
    "--floating-ai-trigger-bottom": `${placement.bottom}px`,
  } as CSSProperties : undefined;
  return (
    <div className={className} hidden={hidden} style={placementStyle}>
      {children}
    </div>
  );
}
