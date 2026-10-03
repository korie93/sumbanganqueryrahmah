import { ArrowRight } from "lucide-react";
import type { NavigationEntry } from "@/app/navigation";

export type HomeNavigationHandlers = {
  onNavigateItem: (itemId: string) => void;
  onPrefetchItem: (itemId: string) => void;
};

export function HomeNavigationCard({ item, primary = false, onNavigateItem, onPrefetchItem }:
  HomeNavigationHandlers & { item: NavigationEntry; primary?: boolean }) {
  const Icon = item.icon;
  return <button type="button" className={primary ? "home-primary-card" : "home-module-row"}
    data-testid={`card-${item.id}`} onClick={() => onNavigateItem(item.id)}
    onMouseEnter={() => onPrefetchItem(item.id)} onFocus={() => onPrefetchItem(item.id)}>
    <span className="home-module-icon"><Icon size={17} aria-hidden="true" /></span>
    <span className="home-module-copy"><strong>{item.title || item.label}</strong><span>{item.description}</span></span>
    <ArrowRight size={15} className="text-muted-foreground" aria-hidden="true" />
  </button>;
}
