import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./SystemMonitorLayout.tsx", import.meta.url),
  "utf8",
);

test("system monitor does not re-emit the requested section on initial mount", () => {
  assert.match(
    source,
    /lastEmittedSectionRef = useRef<MonitorSection \| null>\(requestedSection\)/,
  );
  assert.match(
    source,
    /if \(lastEmittedSectionRef\.current === activeSection\) return;/,
  );
});

test("system monitor context controls retain only permitted sections and the selected section", () => {
  assert.match(source, /availableSections\.map\(\(section\) =>/);
  assert.match(source, /getAriaCurrentPageProps\(activeSection === section\)/);
  assert.match(source, /onSelect=\{setActiveSection\}/);
  assert.match(source, /onClick=\{\(\) => onSelect\(section\)\}/);
  assert.match(source, /aria-label="System Monitor"/);
  assert.match(source, /availableSections\.includes\(requestedSection\)/);
  assert.match(source, /onSectionChange\?\.\(activeSection\)/);
  assert.doesNotMatch(source, /LazySideTabNavigation/);
});

test("mobile System Monitor sheet retains permitted routes and explicit focus restoration", () => {
  assert.match(source, /<Sheet open=\{sectionsOpen\} onOpenChange=\{setSectionsOpen\}/);
  assert.match(source, /<SheetTrigger asChild>/);
  assert.match(source, /<Button ref=\{triggerRef\}/);
  assert.match(source, /<SheetTitle>System Monitor<\/SheetTitle>/);
  assert.match(source, /<SheetDescription>/);
  assert.match(source, /onSelect\(section\); setSectionsOpen\(false\)/);
  assert.equal((source.match(/availableSections\.map\(\(section\) =>/g) || []).length, 2);
  assert.match(source, /onCloseAutoFocus=\{\(event\) => \{\s*event\.preventDefault\(\);/);
  assert.match(source, /const target = isMobile \? triggerRef\.current : desktopCurrentRef\.current/);
  assert.match(source, /if \(target\?\.isConnected\) target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /if \(!isMobile\) setSectionsOpen\(false\)/);
});

test("System Monitor uses compact mobile navigation and keeps desktop navigation printable exclusions", () => {
  const css = readFileSync(new URL("./dashboard/dashboard-workspace.css", import.meta.url), "utf8");
  assert.match(css, /\.monitor-mobile-navigation\s*\{\s*display: none;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.monitor-context-navigation\s*\{\s*display: none;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.monitor-mobile-navigation\s*\{\s*display: block;/);
  assert.match(css, /@media print\s*\{[\s\S]*\.monitor-mobile-navigation/);
});
