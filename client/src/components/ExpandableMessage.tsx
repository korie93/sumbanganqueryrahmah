import * as React from "react";

import { buildExpandableMessageParts } from "@/components/expandable-message-utils";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";

type ExpandableMessageProps = {
  buttonClassName?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
  previewLimit?: number | undefined;
};

/**
 * Renders the shared expandable message component used across SQR screens.
 */
export function ExpandableMessage({
  buttonClassName,
  children,
  className,
  previewLimit,
}: ExpandableMessageProps) {
  const [expanded, setExpanded] = React.useState(false);
  const messageId = React.useId();

  if (typeof children !== "string") {
    return <>{children}</>;
  }

  const messageParts = buildExpandableMessageParts(children, previewLimit);
  if (!messageParts.isTruncated) {
    return <>{messageParts.fullText}</>;
  }

  return (
    <span className={cn("break-words", className)}>
      <span id={messageId}>
        {expanded ? messageParts.fullText : messageParts.previewText}
      </span>{" "}
      <button
        type="button"
        className={cn(
          "inline-flex min-h-7 items-center rounded px-1 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          buttonClassName,
        )}
        aria-controls={messageId}
        aria-label={expanded ? "Ringkaskan mesej penuh" : "Papar mesej penuh"}
        {...getAriaExpandedProps(expanded)}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Ringkaskan mesej" : "Papar mesej penuh"}
      </button>
    </span>
  );
}
