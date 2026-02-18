import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  getAnalyticsSummary, 
  getLoginTrends, 
  getTopActiveUsers, 
  getPeakHours,
  getRoleDistribution 
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Activity, 
  LogIn, 
  Database, 
  FileText, 
  ShieldOff,
  RefreshCw,
  TrendingUp,
  Clock,
  Crown,
  Download
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format } from "date-fns";

interface SummaryData {
  totalUsers: number;
  activeSessions: number;
  loginsToday: number;
  totalDataRows: number;
  totalImports: number;
  bannedUsers: number;
}

interface LoginTrend {
  date: string;
  logins: number;
  logouts: number;
}

interface TopUser {
  username: string;
  role: string;
  loginCount: number;
  lastLogin: string | null;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface RoleData {
  role: string;
  count: number;
}

const ROLE_COLORS: Record<string, string> = {
  superuser: "hsl(var(--chart-1))",
  admin: "hsl(var(--chart-2))",
  user: "hsl(var(--chart-3))",
};

export default function Dashboard() {
  const [trendDays, setTrendDays] = useState(7);
  const [exportingPdf, setExportingPdf] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<SummaryData>({
    queryKey: ["/api/analytics/summary"],
    queryFn: getAnalyticsSummary,
    refetchInterval: 30000,
  });

  const { data: trends, isLoading: trendsLoading, refetch: refetchTrends } = useQuery<LoginTrend[]>({
    queryKey: ["/api/analytics/login-trends", trendDays],
    queryFn: () => getLoginTrends(trendDays),
    refetchInterval: 30000,
  });

  const { data: topUsers, isLoading: topUsersLoading, refetch: refetchTopUsers } = useQuery<TopUser[]>({
    queryKey: ["/api/analytics/top-users"],
    queryFn: () => getTopActiveUsers(10),
    refetchInterval: 30000,
  });

  const { data: peakHours, isLoading: peakHoursLoading, refetch: refetchPeakHours } = useQuery<PeakHour[]>({
    queryKey: ["/api/analytics/peak-hours"],
    queryFn: getPeakHours,
    refetchInterval: 60000,
  });

  const { data: roleDistribution, isLoading: roleLoading, refetch: refetchRoles } = useQuery<RoleData[]>({
    queryKey: ["/api/analytics/role-distribution"],
    queryFn: getRoleDistribution,
    refetchInterval: 60000,
  });

  const handleRefreshAll = () => {
    refetchSummary();
    refetchTrends();
    refetchTopUsers();
    refetchPeakHours();
    refetchRoles();
  };

  const exportToPDF = async () => {
    if (!dashboardRef.current) return;
    
    setExportingPdf(true);
    try {
      const element = dashboardRef.current;
      const isDark = document.documentElement.classList.contains("dark");
      const bgColor = isDark ? "#1e293b" : "#ffffff";
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: bgColor,
        width: element.scrollWidth,
        height: element.scrollHeight,
        scrollX: 0,
        scrollY: -window.scrollY,
        ignoreElements: (el) => el.tagName === 'IFRAME',
        onclone: (clonedDoc) => {
          const style = clonedDoc.createElement('style');
          style.textContent = `
            * { 
              color: ${isDark ? '#e2e8f0' : '#1e293b'} !important;
              background-color: ${isDark ? '#1e293b' : '#ffffff'} !important;
              border-color: ${isDark ? '#475569' : '#e2e8f0'} !important;
            }
            .recharts-text { fill: ${isDark ? '#e2e8f0' : '#1e293b'} !important; }
          `;
          clonedDoc.head.appendChild(style);
        },
      });
      
      const imgData = canvas.toDataURL("image/png", 1.0);
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      pdf.setFillColor(isDark ? 30 : 255, isDark ? 41 : 255, isDark ? 59 : 255);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      
      pdf.setFontSize(20);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(isDark ? 255 : 30);
      pdf.text("SQR Dashboard Analytics Report", 14, 18);
      
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(isDark ? 180 : 100);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
      
      pdf.setDrawColor(isDark ? 100 : 200);
      pdf.setLineWidth(0.5);
      pdf.line(14, 30, pageWidth - 14, 30);
      
      const margin = 14;
      const headerHeight = 35;
      const availableWidth = pageWidth - (margin * 2);
      const availableHeight = pageHeight - headerHeight - margin;
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);
      
      const finalWidth = imgWidth * ratio;
      const finalHeight = imgHeight * ratio;
      const imgX = margin + (availableWidth - finalWidth) / 2;
      const imgY = headerHeight;
      
      pdf.addImage(imgData, "PNG", imgX, imgY, finalWidth, finalHeight);
      
      pdf.setFontSize(8);
      pdf.setTextColor(isDark ? 120 : 150);
      pdf.text("Sumbangan Query Rahmah (SQR) System", margin, pageHeight - 5);
      pdf.text(`Page 1 of 1`, pageWidth - margin - 20, pageHeight - 5);
      
      pdf.save(`SQR-Dashboard-Report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error: any) {
      console.error("Failed to export PDF:", error?.message || error);
      alert("Failed to export PDF: " + (error?.message || "Unknown error. Try on desktop browser."));
    } finally {
      setExportingPdf(false);
    }
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d");
    } catch {
      return dateStr;
    }
  };

  const summaryCards = [
    { 
      title: "Total Users", 
      value: summary?.totalUsers || 0, 
      icon: Users, 
      color: "text-blue-600 dark:text-blue-400" 
    },
    { 
      title: "Active Sessions", 
      value: summary?.activeSessions || 0, 
      icon: Activity, 
      color: "text-green-600 dark:text-green-400" 
    },
    { 
      title: "Logins Today", 
      value: summary?.loginsToday || 0, 
      icon: LogIn, 
      color: "text-purple-600 dark:text-purple-400" 
    },
    { 
      title: "Total Data Rows", 
      value: summary?.totalDataRows || 0, 
      icon: Database, 
      color: "text-orange-600 dark:text-orange-400" 
    },
    { 
      title: "Total Imports", 
      value: summary?.totalImports || 0, 
      icon: FileText, 
      color: "text-teal-600 dark:text-teal-400" 
    },
    { 
      title: "Banned Users", 
      value: summary?.bannedUsers || 0, 
      icon: ShieldOff, 
      color: "text-red-600 dark:text-red-400" 
    },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-dashboard-title">
              Dashboard Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              System overview and activity insights
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={exportToPDF} 
              variant="outline"
              disabled={exportingPdf}
              data-testid="button-export-pdf"
            >
              {exportingPdf ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export PDF
            </Button>
            <Button 
              onClick={handleRefreshAll} 
              variant="outline"
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div ref={dashboardRef} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="glass-card" data-testid={`card-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-background/50 ${card.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div aria-live="polite">
                      {summaryLoading ? (
                        <div className="space-y-1">
                          <div className="h-7 w-12 bg-muted/50 rounded animate-pulse" aria-label="Loading value" />
                          <p className="text-xs text-muted-foreground">{card.title}</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-2xl font-bold text-foreground">
                            {card.value.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">{card.title}</p>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card" data-testid="card-login-trends">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5" />
                Login Trends
              </CardTitle>
              <div className="flex gap-1" role="group" aria-label="Select trend period">
                {[7, 14, 30].map((days) => (
                  <Button
                    key={days}
                    variant={trendDays === days ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setTrendDays(days)}
                    aria-pressed={trendDays === days}
                    aria-label={`Show ${days} day trends`}
                    data-testid={`button-trend-${days}d`}
                  >
                    {days}d
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent aria-live="polite">
              {trendsLoading ? (
                <div className="h-[250px] flex items-center justify-center" role="status" aria-label="Loading login trends">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="sr-only">Loading login trends chart</span>
                </div>
              ) : trends && trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={trends}>
                    <defs>
                      <linearGradient id="loginGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="logoutGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatDate}
                      className="text-xs"
                    />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                      labelFormatter={formatDate}
                    />
                    <Area
                      type="monotone"
                      dataKey="logins"
                      stroke="hsl(var(--chart-1))"
                      fill="url(#loginGradient)"
                      name="Logins"
                    />
                    <Area
                      type="monotone"
                      dataKey="logouts"
                      stroke="hsl(var(--chart-2))"
                      fill="url(#logoutGradient)"
                      name="Logouts"
                    />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-peak-hours">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="w-5 h-5" />
                Peak Activity Hours
              </CardTitle>
            </CardHeader>
            <CardContent aria-live="polite">
              {peakHoursLoading ? (
                <div className="h-[250px] flex items-center justify-center" role="status" aria-label="Loading peak hours">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="sr-only">Loading peak hours chart</span>
                </div>
              ) : peakHours && peakHours.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={peakHours}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={formatHour}
                      className="text-xs"
                      interval={2}
                    />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                      labelFormatter={(hour) => formatHour(hour as number)}
                      formatter={(value: number) => [value, "Logins"]}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--chart-3))" 
                      radius={[4, 4, 0, 0]}
                      name="Logins"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="glass-card lg:col-span-2" data-testid="card-top-users">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Crown className="w-5 h-5" />
                Top Active Users
              </CardTitle>
            </CardHeader>
            <CardContent aria-live="polite">
              {topUsersLoading ? (
                <div className="h-[300px] flex items-center justify-center" role="status" aria-label="Loading top users">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="sr-only">Loading top active users</span>
                </div>
              ) : topUsers && topUsers.length > 0 ? (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {topUsers.map((user, index) => (
                    <div 
                      key={user.username}
                      className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50"
                      data-testid={`row-top-user-${index}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.username}</p>
                          <p className="text-xs text-muted-foreground">
                            Last login: {user.lastLogin ? format(new Date(user.lastLogin), "MMM d, h:mm a") : "Unknown"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          {user.role}
                        </Badge>
                        <div className="text-right">
                          <p className="font-bold text-foreground">{user.loginCount}</p>
                          <p className="text-xs text-muted-foreground">logins</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-role-distribution">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5" />
                User Roles
              </CardTitle>
            </CardHeader>
            <CardContent aria-live="polite">
              {roleLoading ? (
                <div className="h-[300px] flex items-center justify-center" role="status" aria-label="Loading user roles">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span className="sr-only">Loading user role distribution</span>
                </div>
              ) : roleDistribution && roleDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={roleDistribution}
                      dataKey="count"
                      nameKey="role"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ role, count }) => `${role}: ${count}`}
                    >
                      {roleDistribution.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={ROLE_COLORS[entry.role] || `hsl(var(--chart-${(index % 5) + 1}))`} 
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
