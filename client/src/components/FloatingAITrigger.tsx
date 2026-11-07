import { lazy, Suspense, useEffect, useId, useState, type MouseEventHandler, type Ref } from "react";
import { LoaderCircle } from "lucide-react";
import { SQR_BRAND_ASSETS, SQR_BRAND_DIMENSIONS } from "@shared/brand-assets";
import { Badge } from "@/components/ui/badge";
import { FloatingTriggerShell } from "@/components/FloatingAIShell";
import { AIIconTooltip, AIIconTooltipButton } from "@/components/AIIconTooltip";
import type { FloatingAiLayout } from "@/components/floating-ai-layout-types";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

function StaticLauncherQ({ dotsHidden = false }: { dotsHidden?: boolean }) {
  return <img src={dotsHidden ? "/brand/sidebar-q-body.png" : SQR_BRAND_ASSETS.transparentIcon}
    width={SQR_BRAND_DIMENSIONS.icon.width} height={SQR_BRAND_DIMENSIONS.icon.height}
    className={styles.floatingBrandImage} alt="" aria-hidden="true" decoding="async" draggable={false}
    onError={({ currentTarget }) => {
      if (!currentTarget.src.endsWith(SQR_BRAND_ASSETS.transparentIcon)) currentTarget.src = SQR_BRAND_ASSETS.transparentIcon;
    }} />;
}

// Share the original sidebar artwork/motion chunk, with no blank loading frame.
const LauncherAnimatedQ = lazy(() => import("./SidebarAnimatedQ")
  .then((module) => ({ default: module.SidebarAnimatedQ }))
  .catch(() => ({ default: StaticLauncherQ })));

type FloatingAITriggerProps = {
  assistantLabel: string;
  handleTriggerToggleClick: MouseEventHandler<HTMLButtonElement>;
  hideForFocusedEditable: boolean;
  isMobile: boolean;
  isOpen: boolean;
  isThinking: boolean;
  layoutState: FloatingAiLayout;
  minimizedStatus: string;
  minimizedStatusId: string;
  panelId: string;
  triggerButtonRef: Ref<HTMLButtonElement>;
  unreadCount: number;
  applyLayoutPlacement?: boolean | undefined;
  isLoading?: boolean | undefined;
};

/**
 * Renders the floating ai trigger control for its companion surface.
 */
export function FloatingAITrigger({
  assistantLabel,
  handleTriggerToggleClick,
  hideForFocusedEditable,
  isMobile,
  isOpen,
  isThinking,
  layoutState,
  minimizedStatus,
  minimizedStatusId,
  panelId,
  triggerButtonRef,
  unreadCount,
  applyLayoutPlacement = false,
  isLoading = false,
}: FloatingAITriggerProps) {
  const triggerHidden =
    layoutState.triggerHidden
    && (isOpen || layoutState.shouldAutoMinimize);
  const showMinimizedStatus = !isOpen && isThinking && !layoutState.rootHidden && !isMobile;
  const showUnreadBadge = !isOpen && unreadCount > 0;
  const [lastUnreadCount, setLastUnreadCount] = useState(Math.max(1, unreadCount));
  useEffect(() => { if (unreadCount > 0) setLastUnreadCount(unreadCount); }, [unreadCount]);
  const visibleUnreadCount = unreadCount > 0 ? unreadCount : lastUnreadCount;
  const unreadDescriptionId = useId();
  const triggerDescriptionId = [
    showMinimizedStatus ? minimizedStatusId : undefined,
    showUnreadBadge ? unreadDescriptionId : undefined,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <FloatingTriggerShell
      className={cn(
        "absolute flex flex-col gap-3 pointer-events-none",
        styles.floatingTriggerShell,
        layoutState.trigger.anchor === "left" ? "items-start" : "items-end",
        triggerHidden ? "translate-y-2 opacity-0" : "opacity-100",
      )}
      hidden={triggerHidden}
      placement={applyLayoutPlacement ? layoutState.trigger : undefined}
    >
      {showMinimizedStatus ? (
        <div
          id={minimizedStatusId}
          className={cn("pointer-events-none max-w-[220px] rounded-lg border px-3 py-1.5 text-2xs shadow-sm", styles.floatingMinimizedStatus)}
          role="status"
          aria-live="polite"
        >
          {minimizedStatus}
        </div>
      ) : null}
      <AIIconTooltip sideOffset={16} label={isLoading ? "Memuatkan bantuan AI." : isOpen ? `Kecilkan panel ${assistantLabel}` : `Buka panel ${assistantLabel}`}>
        <AIIconTooltipButton
          ref={triggerButtonRef}
          type="button"
          onClick={handleTriggerToggleClick}
          aria-controls={panelId}
          persistentDescriptionId={triggerDescriptionId}
          aria-haspopup="dialog"
          aria-busy={isLoading || undefined}
          aria-label={isOpen ? `Kecilkan panel ${assistantLabel}` : `Buka panel ${assistantLabel}`}
          {...getAriaExpandedProps(isOpen)}
          className={cn(
            "pointer-events-auto relative flex items-center justify-center",
            styles.floatingTriggerButton,
            isMobile ? "h-12 w-12" : "h-14 w-14",
            hideForFocusedEditable ? "pointer-events-none" : "",
            triggerHidden ? "pointer-events-none scale-95 opacity-0" : "",
          )}
          data-testid="floating-ai-toggle"
        >
          <span className={styles.floatingBrandMark} data-floating-ai-artwork="true" aria-hidden="true">
            {isLoading
              ? <LoaderCircle className="h-6 w-6 motion-safe:animate-spin" aria-hidden="true" />
              : <Suspense fallback={<StaticLauncherQ dotsHidden={showUnreadBadge} />}><LauncherAnimatedQ dotsHidden={showUnreadBadge} /></Suspense>}
            <Badge className={styles.floatingUnreadBadge} data-active={showUnreadBadge} aria-hidden="true" data-testid="floating-ai-unread-badge">
              {visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}
            </Badge>
          </span>
          {showUnreadBadge ? (
            <span id={unreadDescriptionId} className="sr-only">{unreadCount} mesej AI belum dibaca.</span>
          ) : null}
        </AIIconTooltipButton>
      </AIIconTooltip>
    </FloatingTriggerShell>
  );
}
