import { forwardRef, type ComponentPropsWithoutRef, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AIIconTooltipProps = {
  label: string;
  children: ReactElement;
  side?: "top" | "bottom";
};

type AIIconTooltipButtonProps = ComponentPropsWithoutRef<"button"> & {
  persistentDescriptionId?: string | undefined;
};

/** Preserve a status hint when Radix supplies its transient tooltip description. */
export const AIIconTooltipButton = forwardRef<HTMLButtonElement, AIIconTooltipButtonProps>(
  function AIIconTooltipButton({ persistentDescriptionId, "aria-describedby": tooltipDescriptionId, ...props }, ref) {
    const descriptionIds = [...new Set(`${persistentDescriptionId ?? ""} ${tooltipDescriptionId ?? ""}`.split(/\s+/).filter(Boolean))].join(" ") || undefined;
    return <button {...props} ref={ref} aria-describedby={descriptionIds} />;
  },
);

/** Explain icon controls on hover or keyboard focus without another layout box. */
export function AIIconTooltip({ label, children, side = "top" }: AIIconTooltipProps) {
  return (
    <TooltipProvider delayDuration={350}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} collisionPadding={8} className="motion-reduce:animate-none">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
