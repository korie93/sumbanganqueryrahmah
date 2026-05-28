import { Suspense, lazy, type MouseEventHandler, type Ref } from "react";
import { Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingAIChatErrorBoundary } from "@/components/FloatingAIChatErrorBoundary";
import { FloatingPanelShell } from "@/components/FloatingAIShell";
import type { AIChatStatus } from "@/components/AIChat";
import type { FloatingAiLayout } from "@/components/floating-ai-layout-types";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

const AIChat = lazy(() => import("@/components/AIChat"));

export const FLOATING_AI_PANEL_DESCRIPTION = "Panel bantuan AI untuk pertanyaan berkaitan koleksi dan rekod";

type FloatingAIPanelProps = {
  activePage: string;
  aiEnabled: boolean;
  assistantLabel: string;
  handlePanelMinimizeClick: MouseEventHandler<HTMLButtonElement>;
  handleReset: () => void;
  isMobile: boolean;
  isOpen: boolean;
  isThinking: boolean;
  layoutState: FloatingAiLayout;
  messagesLength: number;
  modalDialogA11yProps: {
    "aria-modal"?: "true";
  };
  panelDescriptionId: string;
  panelId: string;
  panelSurfaceRef: Ref<HTMLElement>;
  panelTitleId: string;
  preferCompactPanel: boolean;
  registerCancelAISearch: (cancelFn: (() => void) | null) => void;
  setAiStatus: (status: AIChatStatus) => void;
  shouldKeepPanelMounted: boolean;
  shouldShowPanel: boolean;
  timeoutMs: number;
};

export function FloatingAIPanel({
  activePage,
  aiEnabled,
  assistantLabel,
  handlePanelMinimizeClick,
  handleReset,
  isMobile,
  isOpen,
  isThinking,
  layoutState,
  messagesLength,
  modalDialogA11yProps,
  panelDescriptionId,
  panelId,
  panelSurfaceRef,
  panelTitleId,
  preferCompactPanel,
  registerCancelAISearch,
  setAiStatus,
  shouldKeepPanelMounted,
  shouldShowPanel,
  timeoutMs,
}: FloatingAIPanelProps) {
  if (!shouldKeepPanelMounted) {
    return null;
  }

  return (
    <FloatingPanelShell
      hidden={!shouldShowPanel}
      className={cn(
        "pointer-events-none absolute transition-[opacity,transform] duration-200",
        styles.floatingPanelShell,
        layoutState.panel.mode === "fullscreen" ? styles.floatingPanelShellFullscreen : "",
        shouldShowPanel ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <section
        ref={panelSurfaceRef}
        id={panelId}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden border supports-[backdrop-filter]:backdrop-blur-sm",
          styles.floatingPanelSurface,
          shouldShowPanel ? "pointer-events-auto" : "pointer-events-none",
          layoutState.panel.mode === "fullscreen"
            ? styles.floatingPanelFullscreenSurface
            : "",
          layoutState.panel.mode === "sheet"
            ? cn("rounded-[24px]", styles.floatingPanelSheetSurface)
            : layoutState.panel.mode === "fullscreen"
              ? styles.floatingPanelFullscreenSurfaceChrome
              : cn("rounded-[18px]", styles.floatingPanelDockedSurface),
        )}
        role="dialog"
        aria-labelledby={panelTitleId}
        aria-describedby={panelDescriptionId}
        data-floating-ai-dialog="true"
        data-floating-ai-panel-mode={layoutState.panel.mode}
        tabIndex={-1}
        {...modalDialogA11yProps}
      >
        {isMobile ? (
          <div
            className={cn(
              "flex shrink-0 justify-center",
              layoutState.panel.mode === "fullscreen" ? "pt-3" : "pt-2",
            )}
          >
            <div className={cn("h-1.5 w-10 rounded-full", styles.floatingMobileHandle)} aria-hidden="true" />
          </div>
        ) : null}
        <header
          className={cn(
            "flex shrink-0 items-center justify-between border-b",
            styles.floatingPanelHeader,
            isMobile
              ? cn(styles.floatingPanelHeaderMobile, "supports-[backdrop-filter]:backdrop-blur-xl")
              : styles.floatingPanelHeaderDesktop,
            isMobile && layoutState.panel.mode === "fullscreen"
              ? "min-h-16 px-4"
              : isMobile
                ? "min-h-14 px-3.5"
                : "h-14 px-4",
          )}
        >
          <div className="min-w-0">
            <h2
              id={panelTitleId}
              className={cn(
                "truncate font-semibold",
                styles.floatingPanelTitle,
                layoutState.panel.mode === "fullscreen" ? "text-base" : "text-sm",
              )}
            >
              {assistantLabel}
            </h2>
            <p
              id={panelDescriptionId}
              className={cn("truncate text-2xs", styles.floatingPanelDescription)}
            >
              {FLOATING_AI_PANEL_DESCRIPTION}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "text-xs",
                styles.floatingHeaderButton,
                isMobile && layoutState.panel.mode === "fullscreen"
                  ? "h-10 px-3"
                  : isMobile
                    ? "h-11 px-2.5"
                    : "h-8 px-2",
              )}
              onClick={handleReset}
              disabled={messagesLength === 0 && !isThinking}
              aria-label={`Reset sesi ${assistantLabel}`}
            >
              Reset Sesi
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                styles.floatingHeaderButton,
                isMobile && layoutState.panel.mode === "fullscreen"
                  ? "h-10 w-10"
                  : isMobile
                    ? "h-11 w-11"
                    : "h-8 w-8",
              )}
              onClick={handlePanelMinimizeClick}
              aria-label={`Kecilkan panel ${assistantLabel}`}
            >
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            layoutState.panel.mode === "fullscreen"
              ? "p-3"
              : isMobile
                ? "p-2.5"
                : "p-3",
          )}
        >
          <div className="h-full min-h-0">
            <Suspense
              fallback={
                <div
                  className="flex h-full items-center justify-center"
                  role="status"
                  aria-label={`Memuatkan panel ${assistantLabel}`}
                  aria-live="polite"
                >
                  <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                </div>
              }
            >
              <FloatingAIChatErrorBoundary boundaryKey={`${activePage}:${Number(isOpen)}`}>
                <AIChat
                  timeoutMs={timeoutMs}
                  aiEnabled={aiEnabled}
                  assistantLabel={assistantLabel}
                  compactMode={preferCompactPanel}
                  onStatusChange={setAiStatus}
                  onCancelAISearchReady={registerCancelAISearch}
                />
              </FloatingAIChatErrorBoundary>
            </Suspense>
          </div>
        </div>
      </section>
    </FloatingPanelShell>
  );
}
