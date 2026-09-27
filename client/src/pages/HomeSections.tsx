import { ArrowRight, ChevronRight } from "lucide-react";
import { OperationalPage } from "@/components/layout/OperationalPage";
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
    <OperationalPage width="content" className="max-w-6xl">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">SQR Workspace</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Search, manage collections, and review your data.
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            <span className="home-mobile-hero-chip">{visibleItemsCount} modules ready</span>
            <span className="home-mobile-hero-chip">Role: {userRole}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3">
            {sections.heroActions.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={`hero-${item.id}`}
                  type="button"
                  variant="outline"
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
        </header>

        <section className="home-mobile-surface">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Quick Actions</h2>
            </div>
            <span className="home-mobile-count-chip">
              Top {sections.quickActions.length}
            </span>
          </div>

          <div className="mt-3 space-y-2">
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
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        {sections.secondaryItems.length > 0 ? (
          <section className="home-mobile-surface">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">More Modules</h2>
              </div>
              <span className="home-section-count-chip">
                {sections.secondaryItems.length}
              </span>
            </div>

            <div className="mt-3 space-y-2">
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
    </OperationalPage>
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
    <OperationalPage width="content" className="max-w-6xl">
        <header className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="text-section-title font-semibold tracking-tight text-foreground">SQR Workspace</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Sumbangan Query Rahmah - Data Management System
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 xl:pt-2">
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
        </header>

          {sections.primaryActions.length > 0 ? (
          <section aria-label="Primary workflows" className="space-y-3">
            <h2 className="home-desktop-primary-kicker">Primary Workflow</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {sections.primaryActions.map((item) => (
                <HomeDesktopPrimaryCard
                  key={item.id}
                  item={item}
                  onNavigateItem={onNavigateItem}
                  onPrefetchItem={onPrefetchItem}
                />
              ))}
            </div>
          </section>
          ) : null}

        {hasSecondarySections ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {sections.workspaceItems.length > 0 ? (
              <section className="home-section-shell">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Operational modules</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Import and manage saved datasets.
                    </p>
                  </div>
                  <span className="home-section-count-chip">{sections.workspaceItems.length}</span>
                </div>

                <div className="mt-3 space-y-2">
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
                    <h2 className="text-base font-semibold text-foreground">Visibility and follow-up</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Review analytics, activity, and audit logs.
                    </p>
                  </div>
                  <span className="home-section-count-chip">
                    {insightItems.length}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
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
    </OperationalPage>
  );
}
