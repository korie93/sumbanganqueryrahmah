import { CircleHelp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MonthlyComparisonHintProps = {
  label: string;
  text: string;
};

export function MonthlyComparisonHint({
  label,
  text,
}: MonthlyComparisonHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={label}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="max-w-[min(20rem,calc(100vw-2rem))] text-xs leading-5">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
