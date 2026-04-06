export function getActivityFiltersPanelHeaderClassName(isMobile: boolean) {
  return isMobile ? "pb-2.5" : "pb-3";
}

export function getActivityFiltersPanelTitle(isMobile: boolean) {
  return isMobile ? "Search & Filters" : "Filter Activity Logs";
}

export function getActivityFiltersPanelTitleClassName(isMobile: boolean) {
  return `${isMobile ? "text-base" : "text-lg"} flex items-center gap-2`;
}

export function getActivityStatusOptionClassName(isMobile: boolean) {
  return isMobile
    ? "flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5"
    : "flex items-center gap-2";
}

export function getActivityFilterActionContainerClassName(isMobile: boolean) {
  return isMobile ? "flex flex-wrap gap-2 pt-2 grid grid-cols-2" : "flex gap-2 flex-wrap pt-2";
}

export function getActivityFilterActionButtonClassName(isMobile: boolean) {
  return isMobile ? "w-full" : undefined;
}
