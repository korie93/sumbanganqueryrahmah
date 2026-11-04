import { memo } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type InfoHintProps = {
  text: string;
  label?: string;
};

function InfoHintImpl({ text, label = "Maklumat bantuan" }: InfoHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground transition hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-6 sm:w-6"
          aria-label={label}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-xs">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Renders the shared info hint component used across SQR screens.
 */
export const InfoHint = memo(InfoHintImpl);
