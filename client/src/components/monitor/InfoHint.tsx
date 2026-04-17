import { memo } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type InfoHintProps = {
  label?: string;
  text: string;
};

function resolveInfoHintLabel(text: string, label?: string) {
  const normalizedLabel = String(label || "").trim();
  if (normalizedLabel) {
    return normalizedLabel;
  }

  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return "Show more information";
  }

  return normalizedText.length <= 160
    ? normalizedText
    : `${normalizedText.slice(0, 157)}...`;
}

function InfoHintImpl({ label, text }: InfoHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-sm text-muted-foreground transition hover:text-foreground"
          aria-label={resolveInfoHintLabel(text, label)}
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

export const InfoHint = memo(InfoHintImpl);
