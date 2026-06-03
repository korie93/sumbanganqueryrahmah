import type { ReactNode, Ref } from "react";

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
};

/**
 * Renders the shared floating trigger shell component used across SQR screens.
 */
export function FloatingTriggerShell({
  className,
  hidden,
  children,
}: FloatingTriggerShellProps) {
  return (
    <div className={className} hidden={hidden}>
      {children}
    </div>
  );
}
