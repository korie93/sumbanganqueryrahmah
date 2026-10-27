import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { FloatingAIIdleView, type FloatingAIIdleProps } from "@/components/FloatingAIIdleView";
import { LazySuspenseFallback } from "@/components/LazySuspenseFallback";
import { isEditableElement } from "@/components/floating-ai-dom-utils";
import type { FloatingAiLayout } from "@/components/floating-ai-layout-types";
import { isFloatingAiSaveCollectionRoute, isFloatingAiSavedMobileRoute } from "@/components/floating-ai-visibility";
import { useIsMobile } from "@/hooks/use-mobile";

const importRetryPlacement = async () => {
  const entries = import.meta.glob<typeof import("./FloatingAIIdlePlacement").default>("./FloatingAIIdlePlacement.tsx", {
    query: "?sqr-ai-retry",
    import: "default",
  });
  const load = entries["./FloatingAIIdlePlacement.tsx"];
  if (!load) throw new Error("AI placement retry is unavailable.");
  return { default: await load() };
};
const createIdlePlacement = (retry = false) => retry
  ? lazy(importRetryPlacement)
  : lazy(() => import("@/components/FloatingAIIdlePlacement"));

type IdlePlacementBoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
};

class IdlePlacementBoundary extends Component<IdlePlacementBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    // A failed optional chunk must not replace the workspace or put an unsafe
    // default-position button over the form it was meant to protect.
    return (
      <div className="mx-4 mb-4 rounded-lg border p-3 text-sm" role="alert">
        <p>Bantuan AI tidak dapat dimuatkan.</p>
        <button type="button" className="mt-2 rounded-md border px-3 py-2 font-medium" onClick={this.props.onRetry}>
          Cuba semula bantuan AI
        </button>
      </div>
    );
  }
}

function CollisionAwareIdleLauncher(props: FloatingAIIdleProps & { location: string; isMobile: boolean }) {
  const [placement, setPlacement] = useState(() => ({ attempt: 0, Component: createIdlePlacement() }));
  const Placement = placement.Component;

  return (
    <IdlePlacementBoundary
      key={placement.attempt}
      onRetry={() => setPlacement((previous) => ({ attempt: previous.attempt + 1, Component: createIdlePlacement(true) }))}
    >
      <Suspense fallback={<LazySuspenseFallback label="Menyiapkan bantuan AI." />}>
        <Placement {...props} />
      </Suspense>
    </IdlePlacementBoundary>
  );
}

// Ordinary routes use the existing CSS placement. Panel dimensions are unused
// until the full runtime is explicitly activated.
const idleLayout: FloatingAiLayout = {
  rootHidden: false,
  triggerHidden: false,
  shouldAutoMinimize: false,
  trigger: { bottom: 24, left: null, right: 24, anchor: "right", size: 56 },
  panel: { bottom: 24, left: null, right: 24, width: 0, height: 0, mode: "dock", alignment: "right" },
};

function PlainIdleLauncher(props: FloatingAIIdleProps & { isMobile: boolean }) {
  const [hasFocusedEditable, setHasFocusedEditable] = useState(false);

  useEffect(() => {
    if (!props.isMobile) {
      setHasFocusedEditable(false);
      return;
    }

    const syncFocusedEditable = () => {
      setHasFocusedEditable(isEditableElement(document.activeElement));
    };
    syncFocusedEditable();
    document.addEventListener("focusin", syncFocusedEditable);
    document.addEventListener("focusout", syncFocusedEditable);
    return () => {
      document.removeEventListener("focusin", syncFocusedEditable);
      document.removeEventListener("focusout", syncFocusedEditable);
    };
  }, [props.isMobile]);

  return <FloatingAIIdleView {...props} hasFocusedEditable={hasFocusedEditable} layoutState={idleLayout} />;
}

/** Renders the idle AI trigger, deferring collision placement on sensitive routes. */
export default function FloatingAIIdleLauncher(props: FloatingAIIdleProps) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const needsPlacement = isFloatingAiSaveCollectionRoute(props.activePage, location)
    || isFloatingAiSavedMobileRoute(props.activePage, location, isMobile);

  if (needsPlacement) {
    // Never paint a default-position launcher over a live form while its small
    // placement-only chunk is loading.
    return (
      <CollisionAwareIdleLauncher
        key={`${props.activePage}:${location}:${Number(isMobile)}`}
        {...props}
        location={location}
        isMobile={isMobile}
      />
    );
  }

  return <PlainIdleLauncher {...props} isMobile={isMobile} />;
}
