import { ArrowRight, ChevronRight } from "lucide-react";
import type { NavigationEntry } from "@/app/navigation";

export type HomeNavigationHandlers = {
  onNavigateItem: (itemId: string) => void;
  onPrefetchItem: (itemId: string) => void;
};

type HomeNavigationCardProps = HomeNavigationHandlers & {
  item: NavigationEntry;
};

export function HomeDesktopPrimaryCard({
  item,
  onNavigateItem,
  onPrefetchItem,
}: HomeNavigationCardProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigateItem(item.id)}
      onMouseEnter={() => onPrefetchItem(item.id)}
      onFocus={() => onPrefetchItem(item.id)}
      className="home-desktop-primary-card"
      data-testid={`card-${item.id}`}
    >
      <span className="home-desktop-primary-card-icon">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 space-y-2">
        <p className="home-desktop-primary-kicker">
          Primary Workflow
        </p>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
    </button>
  );
}

export function HomeWorkspaceCard({
  item,
  onNavigateItem,
  onPrefetchItem,
}: HomeNavigationCardProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigateItem(item.id)}
      onMouseEnter={() => onPrefetchItem(item.id)}
      onFocus={() => onPrefetchItem(item.id)}
      className="home-card flex items-center gap-4 text-left"
      data-testid={`card-${item.id}`}
    >
      <span className="home-card-icon">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="home-card-text">
        <h3 className="text-base">{item.title}</h3>
        <p>{item.description}</p>
      </div>
    </button>
  );
}

export function HomeDesktopListCard({
  item,
  onNavigateItem,
  onPrefetchItem,
}: HomeNavigationCardProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigateItem(item.id)}
      onMouseEnter={() => onPrefetchItem(item.id)}
      onFocus={() => onPrefetchItem(item.id)}
      className="home-desktop-list-card"
      data-testid={`card-${item.id}`}
    >
      <span className="home-desktop-list-card-icon">
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
}
