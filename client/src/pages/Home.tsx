import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";
import { memo, useMemo } from "react";
import { type NavigationEntry, getVisibleHomeItems, resolveNavigationTarget } from "@/app/navigation";
import { prefetchNavigationTarget } from "@/app/navigation-prefetch";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import "./Home.css";

interface HomeProps {
  onNavigate: (page: string, importId?: string) => void;
  userRole: string;
  tabVisibility?: Record<string, boolean> | null;
}

function prefetchHomeItem(itemId: string) {
  void prefetchNavigationTarget(resolveNavigationTarget(itemId));
}

function HomeImpl({ onNavigate, userRole, tabVisibility }: HomeProps) {
  const isMobile = useIsMobile();
  const visibleItems = useMemo(
    () => getVisibleHomeItems(userRole, tabVisibility || null),
    [tabVisibility, userRole],
  );
  const mobileHomeSections = useMemo(() => {
    const quickActionPriority = [
      "general-search",
      "collection-report",
      "viewer",
      "dashboard",
    ] as const;
    const heroActionPriority = ["general-search", "collection-report"] as const;
    const prioritizedQuickActions = quickActionPriority
      .map((id) => visibleItems.find((item) => item.id === id))
      .filter((item): item is NavigationEntry => Boolean(item));
    const prioritizedQuickActionIds = new Set(prioritizedQuickActions.map((item) => item.id));
    const fallbackQuickActions = visibleItems.filter((item) => !prioritizedQuickActionIds.has(item.id));
    const quickActions = [...prioritizedQuickActions, ...fallbackQuickActions].slice(0, 4);
    const quickActionIds = new Set(quickActions.map((item) => item.id));
    const secondaryItems = visibleItems.filter((item) => !quickActionIds.has(item.id));
    const heroActions = heroActionPriority
      .map((id) => visibleItems.find((item) => item.id === id))
      .filter((item): item is NavigationEntry => Boolean(item));

    return {
      heroActions: heroActions.length > 0 ? heroActions : quickActions.slice(0, 2),
      quickActions,
      secondaryItems,
    };
  }, [visibleItems]);
  if (isMobile) {
    return (
      <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-3 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="mx-auto max-w-md space-y-4">
          <section className="home-mobile-hero">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-white/80">
                  Operational Workspace
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Welcome</h1>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/85">
                  Move between the modules you use most without digging through the full desktop navigation.
                </p>
              </div>
              <span className="rounded-full border border-white/18 bg-white/12 p-3 text-white shadow-sm backdrop-blur">
                <Sparkles className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="home-mobile-hero-chip">{visibleItems.length} modules ready</span>
              <span className="home-mobile-hero-chip">Role: {userRole}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {mobileHomeSections.heroActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={`hero-${item.id}`}
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={() => onNavigate(resolveNavigationTarget(item.id))}
                    onMouseEnter={() => prefetchHomeItem(item.id)}
                    onFocus={() => prefetchHomeItem(item.id)}
                    className="home-mobile-hero-action"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </section>

          <section className="home-mobile-surface">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Quick Actions
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Start the next task</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Top {mobileHomeSections.quickActions.length}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {mobileHomeSections.quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(resolveNavigationTarget(item.id))}
                    onMouseEnter={() => prefetchHomeItem(item.id)}
                    onFocus={() => prefetchHomeItem(item.id)}
                    className="home-mobile-quick-card text-left"
                    data-testid={`card-${item.id}`}
                  >
                    <span className="home-mobile-quick-card-icon">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </button>
                );
              })}
            </div>
          </section>

          {mobileHomeSections.secondaryItems.length > 0 ? (
            <section className="home-mobile-surface">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    More Modules
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    Everything else you can access
                  </h2>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  {mobileHomeSections.secondaryItems.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {mobileHomeSections.secondaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(resolveNavigationTarget(item.id))}
                      onMouseEnter={() => prefetchHomeItem(item.id)}
                      onFocus={() => prefetchHomeItem(item.id)}
                      className="home-mobile-list-card"
                      data-testid={`card-${item.id}`}
                    >
                      <span className="home-mobile-list-card-icon">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 text-left">
                        <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 md:p-6">
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
                onMouseEnter={() => prefetchHomeItem(item.id)}
                onFocus={() => prefetchHomeItem(item.id)}
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
