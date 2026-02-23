import { useState, useEffect, useCallback, useRef } from "react";
import { Activity as ActivityIcon, Users, UserX, RefreshCw, AlertTriangle, Shield, ShieldOff, Clock, Globe, Monitor, Trash2, Filter, X, Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { getAllActivity, getFilteredActivity, deleteActivityLog, kickUser, banUser, unbanUser, getBannedUsers, type ActivityFilters } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ActivityRecord {
  id: string;
  username: string;
  role: string;
  status: ActivityStatus;
  pcName?: string;
  browser?: string;
  fingerprint?: string;
  ipAddress?: string;
  loginTime: string;
  logoutTime?: string;
  lastActivityTime?: string;
  isActive: boolean;
  logoutReason?: string;
}

interface BannedUser {
  visitorId: string;
  banId?: string;
  username: string;
  role: string;
  banInfo?: {
    ipAddress: string | null;
    browser: string | null;
    bannedAt: string | null;
  };
}

type ActivityStatus = "ONLINE" | "IDLE" | "LOGOUT" | "KICKED" | "BANNED";

const STATUS_OPTIONS: { value: ActivityStatus; label: string }[] = [
  { value: "ONLINE", label: "Online" },
  { value: "IDLE", label: "Idle" },
  { value: "LOGOUT", label: "Logout" },
  { value: "KICKED", label: "Kicked" },
  { value: "BANNED", label: "Banned" },
];

export default function Activity() {
  const currentRole = (() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return "";
      const parsed = JSON.parse(raw) as { role?: string };
      return parsed.role || "";
    } catch {
      return "";
    }
  })();
  const canModerateActivity = currentRole === "admin" || currentRole === "superuser";
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [selectedBannedUser, setSelectedBannedUser] = useState<BannedUser | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>({
    status: [],
    username: "",
    ipAddress: "",
    browser: "",
    dateFrom: "",
    dateTo: "",
  });
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const { toast } = useToast();
  const filtersRef = useRef<ActivityFilters>(filters);

  const hasActiveFilters = useCallback((currentFilters: ActivityFilters): boolean => {
    return !!(
      (currentFilters.status && currentFilters.status.length > 0) ||
      currentFilters.username ||
      currentFilters.ipAddress ||
      currentFilters.browser ||
      currentFilters.dateFrom ||
      currentFilters.dateTo
    );
  }, []);

  const fetchActivities = useCallback(async (useFilters: boolean = false) => {
    setLoading(true);
    try {
      let activityResponse;
      const currentFilters = filtersRef.current;
      if (useFilters && hasActiveFilters(currentFilters)) {
        activityResponse = await getFilteredActivity(currentFilters);
      } else {
        activityResponse = await getAllActivity();
      }
      setActivities(activityResponse.activities || []);
      if (canModerateActivity) {
        const bannedResponse = await getBannedUsers();
        setBannedUsers(bannedResponse.users || []);
      } else {
        setBannedUsers([]);
      }
    } catch (err) {
      console.error("Failed to fetch activities:", err);
    } finally {
      setLoading(false);
    }
  }, [hasActiveFilters, canModerateActivity]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    fetchActivities(false);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!hasActiveFilters(filtersRef.current)) {
        fetchActivities(false);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchActivities, hasActiveFilters]);

  const handleApplyFilters = () => {
    fetchActivities(true);
  };

  const handleClearFilters = () => {
    setFilters({
      status: [],
      username: "",
      ipAddress: "",
      browser: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const toggleStatusFilter = (status: ActivityStatus) => {
    setFilters((prev) => {
      const currentStatus = prev.status || [];
      if (currentStatus.includes(status)) {
        return { ...prev, status: currentStatus.filter((s) => s !== status) };
      } else {
        return { ...prev, status: [...currentStatus, status] };
      }
    });
  };

  const handleKickClick = (activity: ActivityRecord) => {
    setSelectedActivity(activity);
    setKickDialogOpen(true);
  };

  const handleBanClick = (activity: ActivityRecord) => {
    console.log("=== BAN CLICK ===");
    console.log("Activity ID:", activity.id);
    console.log("Username:", activity.username);
    console.log("IP:", activity.ipAddress);
    console.log("Fingerprint:", activity.fingerprint?.substring(0, 16));
    console.log("==================");
    setSelectedActivity(activity);
    setBanDialogOpen(true);
  };

  const handleDeleteClick = (activity: ActivityRecord) => {
    setSelectedActivity(activity);
    setDeleteDialogOpen(true);
  };

  const handleUnbanClick = (user: BannedUser) => {
    setSelectedBannedUser(user);
    setUnbanDialogOpen(true);
  };

  const handleKickConfirm = async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await kickUser(selectedActivity.id);
      toast({
        title: "Success",
        description: `${selectedActivity.username} has been force logged out.`,
      });
      fetchActivities(hasActiveFilters(filtersRef.current));
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err?.message || "Failed to kick user.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setKickDialogOpen(false);
      setSelectedActivity(null);
    }
  };

  const handleBanConfirm = async () => {
    if (!selectedActivity) return;

    console.log("=== BAN CONFIRM ===");
    console.log("Banning Activity ID:", selectedActivity.id);
    console.log("Username:", selectedActivity.username);
    console.log("===================");
    
    setActionLoading(selectedActivity.id);
    try {
      await banUser(selectedActivity.id);
      toast({
        title: "Success",
        description: `${selectedActivity.username} has been banned.`,
      });
      fetchActivities(hasActiveFilters(filtersRef.current));
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err?.message || "Failed to ban user.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setBanDialogOpen(false);
      setSelectedActivity(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await deleteActivityLog(selectedActivity.id);
      toast({
        title: "Success",
        description: `Activity log for ${selectedActivity.username} has been deleted.`,
      });
      fetchActivities(hasActiveFilters(filtersRef.current));
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err?.message || "Failed to delete log.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setDeleteDialogOpen(false);
      setSelectedActivity(null);
    }
  };

  const handleUnbanConfirm = async () => {
    if (!selectedBannedUser) return;

    setActionLoading(selectedBannedUser.banId || selectedBannedUser.username);
    try {
      if (!selectedBannedUser.banId) {
        throw new Error("Missing banId for unban.");
      }
      await unbanUser(selectedBannedUser.banId);
      toast({
        title: "Success",
        description: `${selectedBannedUser.username} has been unbanned.`,
      });
      fetchActivities(hasActiveFilters(filtersRef.current));
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err?.message || "Failed to unban user.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setUnbanDialogOpen(false);
      setSelectedBannedUser(null);
    }
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  
  const getSessionDuration = (loginTime: string, logoutTime?: string) => {
    try {
      const start = new Date(loginTime).getTime();
      const end = logoutTime ? new Date(logoutTime).getTime() : Date.now();
      const diffMs = end - start;
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return "< 1 min";
      if (diffMins < 60) return `${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;
      if (diffHours < 24) return `${diffHours}h ${remainingMins}m`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ${diffHours % 24}h`;
    } catch {
      return "-";
    }
  };

  const getStatusBadge = (status: ActivityStatus) => {
    switch (status) {
      case "ONLINE":
        return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">ONLINE</Badge>;
      case "IDLE":
        return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">IDLE</Badge>;
      case "LOGOUT":
        return <Badge variant="secondary">LOGOUT</Badge>;
      case "KICKED":
        return <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">KICKED</Badge>;
      case "BANNED":
        return <Badge variant="destructive">BANNED</Badge>;
    }
  };

  const parseUserAgent = (ua?: string) => {
    if (!ua) return { browser: "Unknown", version: "" };

    // If already parsed (short format like "Chrome 143"), return directly
    if (!ua.includes("Mozilla/") && !ua.includes("AppleWebKit")) {
      const parts = ua.split(" ");
      if (parts.length >= 1) {
        return { browser: parts[0], version: parts[1] || "" };
      }
      return { browser: ua, version: "" };
    }

    // Parse full user agent string
    let browser = "Unknown";
    let version = "";

    if (ua.includes("DuckDuckGo/")) {
      browser = "DuckDuckGo";
      const match = ua.match(/DuckDuckGo\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("Vivaldi/")) {
      browser = "Vivaldi";
      const match = ua.match(/Vivaldi\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("Brave/") || ua.includes("Brave")) {
      browser = "Brave";
      const match = ua.match(/Chrome\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("OPR/") || ua.includes("Opera/")) {
      browser = "Opera";
      const match = ua.match(/OPR\/(\d+)/) || ua.match(/Opera\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("Edg/") || ua.includes("Edge/")) {
      browser = "Edge";
      const match = ua.match(/Edg\/(\d+)/) || ua.match(/Edge\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("Firefox/")) {
      browser = "Firefox";
      const match = ua.match(/Firefox\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("Chrome/")) {
      browser = "Chrome";
      const match = ua.match(/Chrome\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
      browser = "Safari";
      const match = ua.match(/Version\/(\d+)/);
      version = match ? match[1] : "";
    } else if (ua.includes("curl/")) {
      browser = "curl";
      const match = ua.match(/curl\/(\d+)/);
      version = match ? match[1] : "";
    }

    return { browser, version };
  };

  const countByStatus = (status: ActivityStatus) => {
    return activities.filter((a) => a.status === status).length;
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Activity Monitor</h1>
            <p className="text-muted-foreground">Monitor user activity in real-time</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filter
              {hasActiveFilters(filters) && (
                <Badge variant="secondary" className="ml-2">
                  {(filters.status?.length || 0) +
                    (filters.username ? 1 : 0) +
                    (filters.ipAddress ? 1 : 0) +
                    (filters.browser ? 1 : 0) +
                    (filters.dateFrom ? 1 : 0) +
                    (filters.dateTo ? 1 : 0)}
                </Badge>
              )}
            </Button>
            <Button variant="outline" onClick={() => fetchActivities(hasActiveFilters(filters))} disabled={loading} data-testid="button-refresh">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {showFilters && (
          <Card className="mb-6 glass-wrapper border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filter Activity Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Status</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`status-${option.value}`}
                        checked={filters.status?.includes(option.value)}
                        onCheckedChange={() => toggleStatusFilter(option.value)}
                        data-testid={`checkbox-status-${option.value.toLowerCase()}`}
                      />
                      <Label htmlFor={`status-${option.value}`} className="text-sm cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="filter-username" className="text-sm font-medium mb-2 block">
                    Username
                  </Label>
                  <Input
                    id="filter-username"
                    placeholder="Search username..."
                    value={filters.username || ""}
                    onChange={(e) => setFilters((prev) => ({ ...prev, username: e.target.value }))}
                    data-testid="input-filter-username"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-ip" className="text-sm font-medium mb-2 block">
                    IP Address
                  </Label>
                  <Input
                    id="filter-ip"
                    placeholder="Search IP..."
                    value={filters.ipAddress || ""}
                    onChange={(e) => setFilters((prev) => ({ ...prev, ipAddress: e.target.value }))}
                    data-testid="input-filter-ip"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-browser" className="text-sm font-medium mb-2 block">
                    Browser
                  </Label>
                  <Input
                    id="filter-browser"
                    placeholder="Search browser..."
                    value={filters.browser || ""}
                    onChange={(e) => setFilters((prev) => ({ ...prev, browser: e.target.value }))}
                    data-testid="input-filter-browser"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Start Date</Label>
                  <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        data-testid="button-date-from"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {filters.dateFrom ? format(new Date(filters.dateFrom + "T12:00:00"), "dd MMM yyyy") : "Select date..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dateFrom ? new Date(filters.dateFrom + "T12:00:00") : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, "0");
                            const day = String(date.getDate()).padStart(2, "0");
                            setFilters((prev) => ({
                              ...prev,
                              dateFrom: `${year}-${month}-${day}`,
                            }));
                          } else {
                            setFilters((prev) => ({ ...prev, dateFrom: "" }));
                          }
                          setDateFromOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">End Date</Label>
                  <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                        data-testid="button-date-to"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {filters.dateTo ? format(new Date(filters.dateTo + "T12:00:00"), "dd MMM yyyy") : "Select date..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dateTo ? new Date(filters.dateTo + "T12:00:00") : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, "0");
                            const day = String(date.getDate()).padStart(2, "0");
                            setFilters((prev) => ({
                              ...prev,
                              dateTo: `${year}-${month}-${day}`,
                            }));
                          } else {
                            setFilters((prev) => ({ ...prev, dateTo: "" }));
                          }
                          setDateToOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap pt-2">
                <Button onClick={handleApplyFilters} data-testid="button-apply-filters">
                  <Filter className="w-4 h-4 mr-2" />
                  Apply Filter
                </Button>
                <Button variant="outline" onClick={handleClearFilters} data-testid="button-clear-filters">
                  <X className="w-4 h-4 mr-2" />
                  Reset Filter
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <div className="glass-wrapper p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-green-500" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-foreground" data-testid="text-online-count">{countByStatus("ONLINE")}</div>
              <p className="text-xs text-muted-foreground truncate">Online</p>
            </div>
          </div>
          <div className="glass-wrapper p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-foreground" data-testid="text-idle-count">{countByStatus("IDLE")}</div>
              <p className="text-xs text-muted-foreground truncate">Idle</p>
            </div>
          </div>
          <div className="glass-wrapper p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <UserX className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-foreground" data-testid="text-logout-count">{countByStatus("LOGOUT")}</div>
              <p className="text-xs text-muted-foreground truncate">Logout</p>
            </div>
          </div>
          <div className="glass-wrapper p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
              <UserX className="w-5 h-5 text-orange-500" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-foreground" data-testid="text-kicked-count">{countByStatus("KICKED")}</div>
              <p className="text-xs text-muted-foreground truncate">Kicked</p>
            </div>
          </div>
          <div className="glass-wrapper p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-bold text-foreground" data-testid="text-banned-count">{bannedUsers.length}</div>
              <p className="text-xs text-muted-foreground truncate">Banned</p>
            </div>
          </div>
        </div>

        {canModerateActivity && bannedUsers.length > 0 && (
          <div className="glass-wrapper p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" />
              Banned Users
            </h2>

            <div className="space-y-3">
              {bannedUsers.map((user) => {
                const banBrowser = user.banInfo?.browser ? parseUserAgent(user.banInfo.browser) : null;
                return (
                  <div
                    key={user.visitorId}
                    className="p-4 bg-destructive/5 rounded-lg border border-destructive/20"
                    data-testid={`banned-user-${user.visitorId}`}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Shield className="w-4 h-4 text-destructive" />
                        <span className="font-medium text-foreground">{user.username}</span>
                        <Badge variant="outline" className="text-xs">
                          {user.role}
                        </Badge>
                      </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnbanClick(user)}
                          disabled={actionLoading === (user.banId || user.visitorId)}
                          data-testid={`button-unban-${user.visitorId}`}
                        >
                        <ShieldOff className="w-4 h-4 mr-1" />
                        Unban
                      </Button>
                    </div>
                    {user.banInfo && (
                      <div className="mt-3 pt-3 border-t border-destructive/10 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Globe className="w-3.5 h-3.5" />
                          <span>IP: {user.banInfo.ipAddress || "Unknown"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Monitor className="w-3.5 h-3.5" />
                          <span>{banBrowser ? `${banBrowser.browser} ${banBrowser.version}` : "Unknown browser"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Banned: {user.banInfo.bannedAt ? format(new Date(user.banInfo.bannedAt), "MMM d, yyyy h:mm a") : "Unknown"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Collapsible open={logsOpen} onOpenChange={setLogsOpen}>
          <div className="glass-wrapper p-6">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto mb-4" data-testid="button-toggle-logs">
                <div className="flex items-center gap-2">
                  <ActivityIcon className="w-5 h-5 text-primary" />
                  <span className="font-semibold text-foreground">Activity Logs</span>
                  <Badge variant="secondary">{activities.length} records</Badge>
                </div>
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${logsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {loading ? (
                <div className="py-8 text-center">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-muted-foreground">Loading...</p>
                </div>
              ) : activities.length === 0 ? (
                <div className="py-8 text-center">
                  <ActivityIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No activity records</p>
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0 z-10">
                        <tr>
                          <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">IP</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Browser</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Login</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Logout</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Duration</th>
                          {canModerateActivity && (
                            <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {activities.map((activity) => {
                          const status = activity.status;
                          const { browser, version } = parseUserAgent(activity.browser);
                          return (
                            <tr key={activity.id} className="border-t border-border hover:bg-muted/50" data-testid={`activity-row-${activity.id}`}>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">{activity.username}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {activity.role}
                                  </Badge>
                                </div>
                              </td>
                              <td className="p-3">{getStatusBadge(status)}</td>
                              <td className="p-3 text-muted-foreground text-xs">{activity.ipAddress || "-"}</td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {browser}{version && ` ${version}`}
                              </td>
                              <td className="p-3 text-muted-foreground text-xs">{formatTime(activity.loginTime)}</td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {activity.logoutTime ? formatTime(activity.logoutTime) : "-"}
                              </td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {getSessionDuration(activity.loginTime, activity.logoutTime)}
                              </td>
                              {canModerateActivity && (
                                <td className="p-3">
                                  <div className="flex gap-1 justify-end">
                                    {activity.isActive && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleKickClick(activity)}
                                          disabled={actionLoading === activity.id}
                                          data-testid={`button-kick-${activity.id}`}
                                        >
                                          <UserX className="w-4 h-4" />
                                        </Button>
                                        {activity.role !== "superuser" && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleBanClick(activity)}
                                            disabled={actionLoading === activity.id}
                                            className="text-destructive"
                                            data-testid={`button-ban-${activity.id}`}
                                          >
                                            <Shield className="w-4 h-4" />
                                          </Button>
                                        )}
                                      </>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteClick(activity)}
                                      disabled={actionLoading === activity.id}
                                      className="text-destructive"
                                      data-testid={`button-delete-${activity.id}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>

      <AlertDialog open={kickDialogOpen} onOpenChange={setKickDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Kick User?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to force logout "{selectedActivity?.username}"? The user can log in
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleKickConfirm} data-testid="button-confirm-kick">
              Kick
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" />
              Ban User?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to ban "{selectedActivity?.username}"? The user will not be able to
              log in until unbanned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBanConfirm}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-ban"
            >
              Ban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Activity Log?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the activity log for "{selectedActivity?.username}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unbanDialogOpen} onOpenChange={setUnbanDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldOff className="w-5 h-5 text-green-500" />
              Unban User?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unban "{selectedBannedUser?.username}"? The user will be able to
              log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnbanConfirm}
              className="bg-green-600 text-white"
              data-testid="button-confirm-unban"
            >
              Unban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
