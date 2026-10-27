import { FloatingAIIdleView, type FloatingAIIdleProps } from "@/components/FloatingAIIdleView";
import { useFloatingAILayoutState } from "@/components/useFloatingAILayoutState";

type FloatingAIIdlePlacementProps = FloatingAIIdleProps & {
  location: string;
  isMobile: boolean;
};

const keepIdleClosed = () => {};

export default function FloatingAIIdlePlacement(props: FloatingAIIdlePlacementProps) {
  const { floatingRootRef, hasFocusedEditable, layoutState } = useFloatingAILayoutState({
    activePage: props.activePage,
    location: props.location,
    hiddenForAiPage: false,
    isMobile: props.isMobile,
    isOpen: false,
    isThinking: false,
    aiStatus: "IDLE",
    messageCount: 0,
    setIsOpen: keepIdleClosed,
  });

  return (
    <FloatingAIIdleView
      {...props}
      rootRef={floatingRootRef}
      hasFocusedEditable={hasFocusedEditable}
      layoutState={layoutState}
      applyLayoutPlacement
    />
  );
}
