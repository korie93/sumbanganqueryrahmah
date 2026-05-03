import assert from "node:assert/strict"
import test from "node:test"

import {
  buildSidebarStateCookie,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
} from "@/components/ui/sidebar-cookie"

test("buildSidebarStateCookie keeps localhost/dev cookies compatible with HTTP", () => {
  assert.equal(
    buildSidebarStateCookie(true, { protocol: "http:" }),
    `${SIDEBAR_COOKIE_NAME}=true; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`,
  )
})

test("buildSidebarStateCookie adds the Secure attribute on HTTPS origins", () => {
  assert.equal(
    buildSidebarStateCookie(false, { protocol: "https:" }),
    `${SIDEBAR_COOKIE_NAME}=false; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax; Secure`,
  )
})
