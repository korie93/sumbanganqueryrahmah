import { getAIChatRemainingCharacterCount, AI_REQUEST_MAX_CHARACTERS } from "./ai-chat-utils";

export function getAIQueryLimitAnnouncement(remaining: number): string {
  if (remaining <= 0) return "Had soalan AI telah dicapai.";
  if (remaining <= 50) return "Baki soalan AI 50 aksara atau kurang.";
  if (remaining <= 200) return "Baki soalan AI 200 aksara atau kurang.";
  return "";
}

export function AIQueryLimit({ value, descriptionId, className }: {
  value: string;
  descriptionId: string;
  className: string;
}) {
  const remaining = getAIChatRemainingCharacterCount(value);
  return <>
    <p id={descriptionId} className="sr-only">Had soalan AI {AI_REQUEST_MAX_CHARACTERS} aksara.</p>
    {remaining <= 200 ? <p className={className} aria-hidden="true" data-ai-limit-counter="true">
      Had soalan AI {AI_REQUEST_MAX_CHARACTERS} aksara. {remaining} aksara berbaki.
    </p> : null}
    <span className="sr-only" aria-live="polite" aria-atomic="true" data-ai-limit-announcement="true">
      {getAIQueryLimitAnnouncement(remaining)}
    </span>
  </>;
}
