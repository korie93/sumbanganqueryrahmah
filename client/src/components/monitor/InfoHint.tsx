import { memo } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type InfoHintProps = {
  text: string;
};

function InfoHintImpl({ text }: InfoHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="note"
          className="inline-flex rounded-sm text-muted-foreground transition hover:text-foreground"
          aria-label="Description"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-xs">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export const InfoHint = memo(InfoHintImpl);
