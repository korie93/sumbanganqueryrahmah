import { useId, useRef, type Ref } from "react";
import { FloatingRootContainer } from "@/components/FloatingAIShell";
import { FloatingAITrigger } from "@/components/FloatingAITrigger";
import type { FloatingAiLayout } from "@/components/floating-ai-layout-types";
import { useAIContext } from "@/context/AIContext";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

export type FloatingAIIdleProps = {
  activePage: string;
  systemName?: string | undefined;
  isLoading: boolean;
  error: boolean;
  onActivate: () => void;
};

type FloatingAIIdleViewProps = FloatingAIIdleProps & {
  isMobile: boolean;
  hasFocusedEditable: boolean;
  layoutState: FloatingAiLayout;
  rootRef?: Ref<HTMLDivElement> | undefined;
  applyLayoutPlacement?: boolean | undefined;
};

/** Renders the lightweight AI trigger and accessible loading or retry feedback. */
export function FloatingAIIdleView({
  systemName,
  isLoading,
  error,
  onActivate,
  isMobile,
  hasFocusedEditable,
  layoutState,
  rootRef,
  applyLayoutPlacement = false,
}: FloatingAIIdleViewProps) {
  const ownRootRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const statusId = useId();
  const { unreadCount } = useAIContext();
  const hideForFocusedEditable = isMobile && hasFocusedEditable;
  const assistantLabel = `AI ${systemName?.trim() || "SQR"}`;

  return (
    <FloatingRootContainer
      rootRef={rootRef ?? ownRootRef}
      hidden={layoutState.rootHidden}
      className={cn(
        "pointer-events-none fixed transition-opacity duration-200",
        styles.floatingRoot,
        layoutState.rootHidden || hideForFocusedEditable ? "translate-y-2 opacity-0" : "opacity-100",
      )}
    >
      <FloatingAITrigger
        assistantLabel={assistantLabel}
        handleTriggerToggleClick={onActivate}
        hideForFocusedEditable={hideForFocusedEditable}
        isMobile={isMobile}
        isOpen={false}
        isThinking={false}
        isLoading={isLoading}
        layoutState={layoutState}
        minimizedStatus=""
        minimizedStatusId={statusId}
        panelId={panelId}
        triggerButtonRef={triggerButtonRef}
        unreadCount={unreadCount}
        applyLayoutPlacement={applyLayoutPlacement}
      />
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isLoading
          ? "Memuatkan bantuan AI."
          : error
            ? "Bantuan AI tidak dapat dimuatkan. Tekan butang AI untuk cuba semula."
            : ""}
      </span>
    </FloatingRootContainer>
  );
}
