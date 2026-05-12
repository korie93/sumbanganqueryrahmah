import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HomeDesktopListCard,
  HomeDesktopPrimaryCard,
  HomeWorkspaceCard,
  type HomeNavigationHandlers,
} from "./HomeNavigationCards";
import type { DesktopHomeSections, MobileHomeSections } from "./home-layout-utils";

type HomeMobileLayoutProps = HomeNavigationHandlers & {
  sections: MobileHomeSections;
  userRole: string;
  visibleItemsCount: number;
};

type HomeDesktopLayoutProps = HomeNavigationHandlers & {
  sections: DesktopHomeSections;
  userRole: string;
  visibleItemsCount: number;
};

export function HomeMobileLayout({
  sections,
  userRole,
  visibleItemsCount,
  onNavigateItem,
  onPrefetchItem,
}: HomeMobileLayoutProps) {
  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-3 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        <section className="home-mobile-hero">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-white/80">
                Operational Workspace
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">SQR Workspace</h1>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/85">
                Move between the modules you use most without digging through the full desktop navigation.
              </p>
            </div>
            <span className="rounded-full border border-white/18 bg-white/12 p-3 text-white shadow-sm backdrop-blur">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="home-mobile-hero-chip">{visibleItemsCount} modules ready</span>
            <span className="home-mobile-hero-chip">Role: {userRole}</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {sections.heroActions.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={`hero-${item.id}`}
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => onNavigateItem(item.id)}
                  onMouseEnter={() => onPrefetchItem(item.id)}
                  onFocus={() => onPrefetchItem(item.id)}
                  className="home-mobile-hero-action"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
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
            <span className="home-mobile-count-chip">
              Top {sections.quickActions.length}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {sections.quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateItem(item.id)}
                  onMouseEnter={() => onPrefetchItem(item.id)}
                  onFocus={() => onPrefetchItem(item.id)}
                  className="home-mobile-quick-card text-left"
                  data-testid={`card-${item.id}`}
                >
                  <span className="home-mobile-quick-card-icon">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        {sections.secondaryItems.length > 0 ? (
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
                {sections.secondaryItems.length}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {sections.secondaryItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigateItem(item.id)}
                    onMouseEnter={() => onPrefetchItem(item.id)}
                    onFocus={() => onPrefetchItem(item.id)}
                    className="home-mobile-list-card"
                    data-testid={`card-${item.id}`}
                  >
                    <span className="home-mobile-list-card-icon">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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

export function HomeDesktopLayout({
  sections,
  userRole,
  visibleItemsCount,
  onNavigateItem,
  onPrefetchItem,
}: HomeDesktopLayoutProps) {
  const insightItems = [...sections.insightsItems, ...sections.overflowItems];
  const hasSecondarySections =
    sections.workspaceItems.length > 0 || sections.insightsItems.length > 0 || sections.overflowItems.length > 0;

  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="home-desktop-hero">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-3">
              <p className="home-section-kicker">Workspace</p>
              <div className="flex items-start gap-4">
                <span className="home-desktop-hero-icon" aria-hidden="true">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h1 className="welcome-title text-4xl font-bold text-foreground md:text-5xl">SQR Workspace</h1>
                  <p className="mt-2 text-base text-muted-foreground md:text-lg">
                    Sumbangan Query Rahmah - Data Management System
                  </p>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Start with the core workflows first, then move into supporting modules only when you need them.
                    The visible navigation stays aligned with your role and current feature visibility settings.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[360px]">
              <div className="home-desktop-stat-chip">
                <span className="home-desktop-stat-label">Modules Ready</span>
                <span className="home-desktop-stat-value">{visibleItemsCount}</span>
              </div>
              <div className="home-desktop-stat-chip">
                <span className="home-desktop-stat-label">Primary Flows</span>
                <span className="home-desktop-stat-value">{sections.primaryActions.length}</span>
              </div>
              <div className="home-desktop-stat-chip">
                <span className="home-desktop-stat-label">Role</span>
                <span className="home-desktop-stat-value capitalize">{userRole}</span>
              </div>
            </div>
          </div>

          {sections.primaryActions.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
              {sections.primaryActions.map((item) => (
                <HomeDesktopPrimaryCard
                  key={item.id}
                  item={item}
                  onNavigateItem={onNavigateItem}
                  onPrefetchItem={onPrefetchItem}
                />
              ))}
            </div>
          ) : null}
        </section>

        {hasSecondarySections ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {sections.workspaceItems.length > 0 ? (
              <section className="home-section-shell">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="home-section-kicker">Workspace</p>
                    <h2 className="mt-1 text-xl font-semibold text-foreground">Operational modules</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Import, review, and revisit the modules used most often during day-to-day operations.
                    </p>
                  </div>
                  <span className="home-section-count-chip">{sections.workspaceItems.length}</span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {sections.workspaceItems.map((item) => (
                    <HomeWorkspaceCard
                      key={item.id}
                      item={item}
                      onNavigateItem={onNavigateItem}
                      onPrefetchItem={onPrefetchItem}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {insightItems.length > 0 ? (
              <section className="home-section-shell">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="home-section-kicker">Insights</p>
                    <h2 className="mt-1 text-xl font-semibold text-foreground">Visibility and follow-up</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Keep analytics, activity, and audit views close without overloading the landing page.
                    </p>
                  </div>
                  <span className="home-section-count-chip">
                    {insightItems.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {insightItems.map((item) => (
                    <HomeDesktopListCard
                      key={item.id}
                      item={item}
                      onNavigateItem={onNavigateItem}
                      onPrefetchItem={onPrefetchItem}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
