import type { MouseEventHandler, Ref } from "react";
import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FloatingTriggerShell } from "@/components/FloatingAIShell";
import type { FloatingAiLayout } from "@/components/floating-ai-layout-types";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

type FloatingAITriggerProps = {
  assistantLabel: string;
  handleTriggerToggleClick: MouseEventHandler<HTMLButtonElement>;
  hideForFocusedEditable: boolean;
  isMobile: boolean;
  isOpen: boolean;
  isThinking: boolean;
  layoutState: FloatingAiLayout;
  minimizedStatus: string;
  panelId: string;
  triggerButtonRef: Ref<HTMLButtonElement>;
  unreadCount: number;
};

export function FloatingAITrigger({
  assistantLabel,
  handleTriggerToggleClick,
  hideForFocusedEditable,
  isMobile,
  isOpen,
  isThinking,
  layoutState,
  minimizedStatus,
  panelId,
  triggerButtonRef,
  unreadCount,
}: FloatingAITriggerProps) {
  const triggerHidden =
    layoutState.triggerHidden
    && (isOpen || layoutState.shouldAutoMinimize);

  return (
    <FloatingTriggerShell
      className={cn(
        "absolute flex flex-col gap-2 pointer-events-none",
        styles.floatingTriggerShell,
        layoutState.trigger.anchor === "left" ? "items-start" : "items-end",
        triggerHidden ? "translate-y-2 opacity-0" : "opacity-100",
      )}
      hidden={triggerHidden}
    >
      {!isOpen && isThinking && !layoutState.rootHidden && !isMobile ? (
        <div className={cn("pointer-events-none max-w-[220px] rounded-lg border px-3 py-1.5 text-2xs shadow-sm", styles.floatingMinimizedStatus)}>
          {minimizedStatus}
        </div>
      ) : null}
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={handleTriggerToggleClick}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={isOpen ? `Kecilkan panel ${assistantLabel}` : `Buka panel ${assistantLabel}`}
        aria-expanded={isOpen}
        className={cn(
          "pointer-events-auto relative flex items-center justify-center rounded-full border transition-transform hover:scale-[1.03]",
          styles.floatingTriggerButton,
          isMobile ? "h-12 w-12" : "h-14 w-14",
          hideForFocusedEditable ? "pointer-events-none" : "",
          triggerHidden ? "pointer-events-none scale-95 opacity-0" : "",
          !isOpen && isThinking ? styles.aiThinkingRing : "",
        )}
        data-testid="floating-ai-toggle"
      >
        <Bot className="h-6 w-6" aria-hidden="true" />
        {!isOpen && unreadCount > 0 ? (
          <Badge
            className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-destructive px-1 text-xxs text-destructive-foreground"
            data-testid="floating-ai-unread-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        ) : null}
      </button>
    </FloatingTriggerShell>
  );
}
