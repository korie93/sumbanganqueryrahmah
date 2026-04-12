import assert from "node:assert/strict"
import test from "node:test"
import { BookMarked, Home, Search } from "lucide-react"

import {
  buildDesktopNavLayoutKey,
  formatSavedCountBadge,
  resolveNavbarActiveMobileItemId,
  resolveNavbarShowHomeButton,
} from "@/components/navbar-utils"
import type { NavigationEntry, NavigationGroup } from "@/app/navigation"

const homeItem: NavigationEntry = {
  id: "home",
  label: "Home",
  icon: Home,
  roles: ["user"],
}

const searchItem: NavigationEntry = {
  id: "general-search",
  label: "Search",
  icon: Search,
  roles: ["user"],
}

const savedItem: NavigationEntry = {
  id: "saved",
  label: "Saved",
  icon: BookMarked,
  roles: ["user"],
}

test("resolveNavbarShowHomeButton detects when home is in the visible mobile nav", () => {
  assert.equal(resolveNavbarShowHomeButton([searchItem, savedItem]), false)
  assert.equal(resolveNavbarShowHomeButton([homeItem, searchItem]), true)
})

test("resolveNavbarActiveMobileItemId prefers the active id and falls back safely", () => {
  assert.equal(
    resolveNavbarActiveMobileItemId([homeItem, searchItem], "general-search"),
    "general-search"
  )
  assert.equal(resolveNavbarActiveMobileItemId([searchItem], "missing"), "general-search")
  assert.equal(resolveNavbarActiveMobileItemId([], "missing"), "home")
})

test("buildDesktopNavLayoutKey stays stable for the same navbar structure", () => {
  const groups: NavigationGroup[] = [
    {
      id: "workspace",
      label: "Workspace",
      description: "Workspace items",
      icon: BookMarked,
      items: [savedItem],
    },
  ]

  const first = buildDesktopNavLayoutKey([searchItem], groups, 12, true)
  const second = buildDesktopNavLayoutKey([searchItem], groups, 12, true)

  assert.equal(first, second)
  assert.match(first, /general-search::workspace:saved::12::home$/)
})

test("formatSavedCountBadge caps large saved counts and hides empty badges", () => {
  assert.equal(formatSavedCountBadge(undefined), null)
  assert.equal(formatSavedCountBadge(0), null)
  assert.equal(formatSavedCountBadge(8), "8")
  assert.equal(formatSavedCountBadge(120), "99+")
})
