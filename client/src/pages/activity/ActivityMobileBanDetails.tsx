import { Clock, Globe, Monitor } from "lucide-react";

type ActivityMobileBanDetailsProps = {
  bannedAtText: string;
  browserText: string;
  ipText: string;
};

export function ActivityMobileBanDetails({
  bannedAtText,
  browserText,
  ipText,
}: ActivityMobileBanDetailsProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/15 bg-background/70 px-2.5 py-1">
        <Globe className="h-3.5 w-3.5" />
        {ipText}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/15 bg-background/70 px-2.5 py-1">
        <Monitor className="h-3.5 w-3.5" />
        {browserText}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/15 bg-background/70 px-2.5 py-1">
        <Clock className="h-3.5 w-3.5" />
        {bannedAtText}
      </span>
    </div>
  );
}
