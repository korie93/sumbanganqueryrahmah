import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { commandModuleKeywords, isCommandSearchShortcut } from "./navbar-command-utils";
import { getVisibleNavItems } from "@/app/navigation";

const key = { key: "/", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, defaultPrevented: false };
test("command search never steals slash from editing, composition or another dialog", () => {
  assert.equal(isCommandSearchShortcut(key, false, false), true);
  assert.equal(isCommandSearchShortcut(key, true, false), false);
  assert.equal(isCommandSearchShortcut(key, false, true), false);
  assert.equal(isCommandSearchShortcut({ ...key, isComposing: true }, false, false), false);
  assert.equal(isCommandSearchShortcut({ ...key, defaultPrevented: true }, false, false), false);
  assert.equal(isCommandSearchShortcut({ ...key, altKey: true }, false, false), false);
});
test("command shortcut accepts Ctrl/Cmd K, without hijacking other keyboard combinations", () => {
  assert.equal(isCommandSearchShortcut({ ...key, key: "K", ctrlKey: true }, true, false), true);
  assert.equal(isCommandSearchShortcut({ ...key, key: "k", metaKey: true }, false, false), true);
  assert.equal(isCommandSearchShortcut({ ...key, key: "k" }, false, false), false);
  assert.equal(isCommandSearchShortcut({ ...key, ctrlKey: true }, false, false), false);
});
test("search keywords derive only from authorized registry entries for every role", () => {
  for (const role of ["admin", "manager", "user"]) {
    assert.deepEqual(getVisibleNavItems(role, null, false).map((item) => item.id), role === "user" ? ["home"] : []);
    const items = getVisibleNavItems(role, { home: true, "general-search": true, backup: true, "audit-logs": true }, false);
    assert.deepEqual(items.map((item) => item.id), ["home", "general-search"]);
    assert.ok(items.map(commandModuleKeywords).flat().includes("General Search"));
  }
  const all = getVisibleNavItems("superuser", null, false);
  assert.ok(all.some((item) => item.id === "backup"));
  assert.ok(!all.some((item) => /logout|sign.?out/i.test(item.id)));
});
test("closed mobile search unmounts the overlay and reuses accessible command/dialog primitives", () => {
  const source = readFileSync(new URL("./NavbarCommandSearch.tsx", import.meta.url), "utf8");
  assert.match(source, /!desktop && open \? \(/);
  assert.match(source, /<DialogTitle/);
  assert.match(source, /onCloseAutoFocus/);
  assert.doesNotMatch(source, /forceMount|onLogout|location\.href\s*=/);
});

test("command search uses the shell viewport and describes the actual inline popup state", () => {
  const source = readFileSync(new URL("./NavbarCommandSearch.tsx", import.meta.url), "utf8");
  const navbar = readFileSync(new URL("./Navbar.tsx", import.meta.url), "utf8");
  assert.match(navbar, /<NavbarCommandSearch items=\{allItems\} desktop=\{desktop\}/);
  assert.doesNotMatch(source, /setDesktop|addEventListener\("change"/);
  assert.match(source, /<CommandInput\s+asChild/);
  assert.match(source, /<input\s+\{\.\.\.getAriaExpandedProps\(open\)\}/);
  assert.match(source, /!open \? \{ "aria-controls": undefined, "aria-activedescendant": undefined \}/);
});
