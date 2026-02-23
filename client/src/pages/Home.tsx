import { Upload, BookMarked, Eye, Search, BarChart3, Activity, ClipboardList, Database, LayoutDashboard, Sparkles } from "lucide-react";

interface HomeProps {
  onNavigate: (page: string) => void;
  userRole: string;
  tabVisibility?: Record<string, boolean> | null;
}

export default function Home({ onNavigate, userRole, tabVisibility }: HomeProps) {
  const isSuperuser = userRole === "superuser";

  const menuItems = [
    {
      id: "import",
      title: "Import Data",
      description: "Import data from Excel/CSV",
      icon: Upload,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "saved",
      title: "Saved Imports",
      description: "View all saved data",
      icon: BookMarked,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "viewer",
      title: "Data Viewer",
      description: "Detailed data display",
      icon: Eye,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "general-search",
      title: "General Search",
      description: "General data search",
      icon: Search,
      roles: ["admin", "superuser", "user"],
    },
    {
      id: "analysis",
      title: "Analysis",
      description: "Data analysis and reports",
      icon: BarChart3,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "dashboard",
      title: "Dashboard",
      description: "Analytics and system overview",
      icon: LayoutDashboard,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "ai",
      title: "AI Center",
      description: "Offline AI search and assistant",
      icon: Sparkles,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "activity",
      title: "Activity Monitor",
      description: "Monitor user activity",
      icon: Activity,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "audit-logs",
      title: "Audit Log",
      description: "View system activity logs",
      icon: ClipboardList,
      roles: ["user", "admin", "superuser"],
    },
    {
      id: "backup",
      title: "Backup & Restore",
      description: "Backup and restore system data",
      icon: Database,
      roles: ["user", "admin", "superuser"],
    },
  ];

  const visibleItems = menuItems.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    if (userRole === "superuser") return true;
    if (!tabVisibility) return true;
    return tabVisibility[item.id] !== false;
  });

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="welcome-title text-4xl md:text-5xl font-bold text-foreground mb-3">
            Welcome
          </h1>
          <p className="text-muted-foreground text-lg">
            Sumbangan Query Rahmah - Data Management System
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="home-card flex items-center gap-4"
                data-testid={`card-${item.id}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="home-card-icon">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="home-card-text">
                  <h3 className="text-base">{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
