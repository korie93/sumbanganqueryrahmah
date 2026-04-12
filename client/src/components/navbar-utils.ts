import { HOME_NAV_ITEM, type NavigationEntry, type NavigationGroup } from "@/app/navigation"

export function resolveNavbarShowHomeButton(mobileItems: NavigationEntry[]) {
  return mobileItems.some((item) => item.id === HOME_NAV_ITEM.id)
}

export function resolveNavbarActiveMobileItemId(
  mobileItems: NavigationEntry[],
  activeNavigationItemId: string
) {
  return (
    mobileItems.find((item) => item.id === activeNavigationItemId)?.id ||
    mobileItems[0]?.id ||
    HOME_NAV_ITEM.id
  )
}

export function buildDesktopNavLayoutKey(
  directItems: NavigationEntry[],
  groupedItems: NavigationGroup[],
  savedCount: number | undefined,
  showHomeButton: boolean
) {
  const directIds = directItems.map((item) => item.id).join("|")
  const groupIds = groupedItems
    .map((group) => `${group.id}:${group.items.map((item) => item.id).join(",")}`)
    .join("|")

  return `${directIds}::${groupIds}::${savedCount ?? 0}::${showHomeButton ? "home" : "no-home"}`
}

export function formatSavedCountBadge(savedCount?: number) {
  if (savedCount === undefined || savedCount <= 0) {
    return null
  }

  return savedCount > 99 ? "99+" : String(savedCount)
}
