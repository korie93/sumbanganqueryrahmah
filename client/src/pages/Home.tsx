import { memo, useMemo } from "react";
import { getVisibleHomeItems, resolveNavigationTarget } from "@/app/navigation";

interface HomeProps {
  onNavigate: (page: string, importId?: string) => void;
  userRole: string;
  tabVisibility?: Record<string, boolean> | null;
}

function HomeImpl({ onNavigate, userRole, tabVisibility }: HomeProps) {
  const visibleItems = useMemo(
    () => getVisibleHomeItems(userRole, tabVisibility || null),
    [tabVisibility, userRole],
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="glass-wrapper p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Workspace</p>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="welcome-title text-4xl font-bold text-foreground md:text-5xl">Welcome</h1>
              <p className="mt-2 text-base text-muted-foreground md:text-lg">
                Sumbangan Query Rahmah - Data Management System
              </p>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Choose a module to continue. The menu is filtered by your role and current feature visibility settings.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(resolveNavigationTarget(item.id))}
                className="home-card flex items-center gap-4 text-left"
                data-testid={`card-${item.id}`}
              >
                <span className="home-card-icon">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="home-card-text">
                  <h3 className="text-base">{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(HomeImpl);
