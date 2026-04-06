import { Clock, Globe, Monitor } from "lucide-react";

type ActivityDesktopBanDetailsProps = {
  bannedAtText: string;
  browserText: string;
  ipText: string;
};

export function ActivityDesktopBanDetails({
  bannedAtText,
  browserText,
  ipText,
}: ActivityDesktopBanDetailsProps) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 border-t border-destructive/10 pt-3 text-sm sm:grid-cols-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Globe className="w-3.5 h-3.5" />
        <span>{ipText}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Monitor className="w-3.5 h-3.5" />
        <span>{browserText}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>{bannedAtText}</span>
      </div>
    </div>
  );
}
