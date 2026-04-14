import assert from "node:assert/strict"
import test from "node:test"

import {
  getNavbarKeyboardScrollLeftDelta,
  resolveNavbarKeyboardScrollStep,
} from "@/components/navbar-scroll-utils"

test("resolveNavbarKeyboardScrollStep keeps a usable minimum target", () => {
  assert.equal(resolveNavbarKeyboardScrollStep(0), 120)
  assert.equal(resolveNavbarKeyboardScrollStep(120), 120)
  assert.equal(resolveNavbarKeyboardScrollStep(200), 120)
})

test("resolveNavbarKeyboardScrollStep scales with wider nav containers", () => {
  assert.equal(resolveNavbarKeyboardScrollStep(400), 160)
  assert.equal(resolveNavbarKeyboardScrollStep(800), 320)
})

test("getNavbarKeyboardScrollLeftDelta maps arrow keys to signed scroll movement", () => {
  assert.equal(getNavbarKeyboardScrollLeftDelta("ArrowLeft", 400), -160)
  assert.equal(getNavbarKeyboardScrollLeftDelta("ArrowRight", 400), 160)
  assert.equal(getNavbarKeyboardScrollLeftDelta("Home", 400), 0)
})
