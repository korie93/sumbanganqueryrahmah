import { Clock, Shield, UserX, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface ActivitySummaryCardsProps {
  bannedCount: number;
  idleCount: number;
  kickedCount: number;
  logoutCount: number;
  onlineCount: number;
}

export function ActivitySummaryCards({
  bannedCount,
  idleCount,
  kickedCount,
  logoutCount,
  onlineCount,
}: ActivitySummaryCardsProps) {
  const isMobile = useIsMobile();

  return (
    <div className={`mb-6 grid gap-4 ${isMobile ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-5"}`}>
      <div className={`glass-wrapper flex items-center gap-3 ${isMobile ? "p-3.5" : "p-4"}`}>
        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-green-500" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold text-foreground" data-testid="text-online-count">{onlineCount}</div>
          <p className="text-xs text-muted-foreground truncate">Online</p>
        </div>
      </div>
      <div className={`glass-wrapper flex items-center gap-3 ${isMobile ? "p-3.5" : "p-4"}`}>
        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-amber-500" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold text-foreground" data-testid="text-idle-count">{idleCount}</div>
          <p className="text-xs text-muted-foreground truncate">Idle</p>
        </div>
      </div>
      <div className={`glass-wrapper flex items-center gap-3 ${isMobile ? "p-3.5" : "p-4"}`}>
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <UserX className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold text-foreground" data-testid="text-logout-count">{logoutCount}</div>
          <p className="text-xs text-muted-foreground truncate">Logout</p>
        </div>
      </div>
      <div className={`glass-wrapper flex items-center gap-3 ${isMobile ? "p-3.5" : "p-4"}`}>
        <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
          <UserX className="w-5 h-5 text-orange-500" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold text-foreground" data-testid="text-kicked-count">{kickedCount}</div>
          <p className="text-xs text-muted-foreground truncate">Kicked</p>
        </div>
      </div>
      <div className={`glass-wrapper flex items-center gap-3 ${isMobile ? "p-3.5" : "p-4"}`}>
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-destructive" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold text-foreground" data-testid="text-banned-count">{bannedCount}</div>
          <p className="text-xs text-muted-foreground truncate">Banned</p>
        </div>
      </div>
    </div>
  );
}
