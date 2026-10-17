import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSync } from "esbuild";
import postcss from "postcss";

// Exercise the rendered shared Input/Button class merging, not just source text.
// These are sizing contracts; they do not replace browser geometry verification.
const bundle = buildSync({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
      import { createElement } from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { CollectionDailyPeriodFields } from "./client/src/pages/collection/CollectionDailyPeriodFields";
      import { CollectionDailyStaffScopeField } from "./client/src/pages/collection/CollectionDailyStaffScopeField";
      import { CollectionDailyUserFilterControl } from "./client/src/pages/collection/CollectionDailyUserFilterControl";
      const noop = () => {};
      const scope = {
        currentUsername: "Synthetic Staff", userPopoverOpen: false, onUserPopoverOpenChange: noop,
        loadingUsers: false, selectedUsersLabel: "Synthetic Staff", users: [], selectedUserSet: new Set(),
        allUsersSelected: false, partiallySelected: false, selectedUsernamesCount: 0,
        onToggleSelectedUser: noop, onSelectAllUsers: noop, onClearSelectedUsers: noop,
      };
      const period = {
        yearInput: "2026", monthInput: "10", minYear: 2020, maxYear: 2030,
        onYearInputChange: noop, onMonthInputChange: noop, onYearCommit: noop, onMonthCommit: noop,
      };
      const render = (component, props) => renderToStaticMarkup(createElement(component, props));
      console.log(JSON.stringify({
        periods: [false, true].map(isMobile => render(CollectionDailyPeriodFields, { ...period, isMobile })),
        readonly: [false, true].map(isMobile => render(CollectionDailyStaffScopeField, { ...scope, isMobile, canManage: false })),
        pending: [false, true].map(isMobile => render(CollectionDailyStaffScopeField, { ...scope, isMobile, canManage: true })),
        triggers: [false, true].map(userPopoverOpen => render(CollectionDailyUserFilterControl, {
          ...scope, userPopoverOpen, triggerId: "synthetic-staff", triggerLabelId: "synthetic-staff-label",
        })),
      }));
    `,
  },
  bundle: true, platform: "node", format: "cjs", packages: "external",
  loader: { ".css": "empty" }, write: false, logLevel: "silent",
});
const markup = JSON.parse(execFileSync(process.execPath, ["--input-type=commonjs"], {
  input: bundle.outputFiles[0].text, encoding: "utf8", windowsHide: true,
}));

test("daily period and readonly scope retain 44px sizing above and below the shared sm breakpoint", () => {
  for (const html of [...markup.periods, ...markup.readonly]) {
    const inputs = html.match(/<input\b[^>]*>/g);
    assert.ok(inputs?.length);
    for (const input of inputs) {
      const classes = new Set(input.match(/class="([^"]*)"/)[1].split(/\s+/));
      for (const size of ["h-11", "min-h-11", "sm:h-11", "sm:min-h-11"]) assert.ok(classes.has(size), size);
      assert.ok(!classes.has("sm:h-9") && !classes.has("sm:min-h-9"));
    }
    assert.match(html, /<label[^>]*class="[^"]*\bblock\b/);
  }
  for (const html of markup.readonly) assert.match(html, /readonly=""/);
});

test("nickname loading placeholder and open/closed triggers reserve the same height", () => {
  for (const html of markup.pending) {
    assert.match(html, /<div class="[^"]*animate-pulse[^\"]*\bh-11\b/);
    assert.doesNotMatch(html, /\bh-9\b|\bh-12\b/);
  }
  for (const [index, html] of markup.triggers.entries()) {
    const trigger = html.match(/<button\b[^>]*data-testid="collection-daily-user-trigger"[^>]*>/)?.[0];
    assert.ok(trigger);
    assert.match(trigger, /class="[^"]*\bh-11\b/);
    assert.match(trigger, /sm:min-h-11/);
    assert.doesNotMatch(trigger, /\bh-12\b|sm:min-h-9/);
    assert.ok(trigger.includes(`aria-expanded="${Boolean(index)}"`));
    assert.match(trigger, /aria-labelledby="synthetic-staff-label synthetic-staff-value"/);
  }
});

test("daily dialog styles preserve a capped natural height and desktop gutters without sizing mobile width", () => {
  const css = postcss.parse(readFileSync("client/src/pages/collection/CollectionDailyDayDetailsDialog.css", "utf8"));
  const declarations = (selector) => {
    const values = {};
    css.walkRules(selector, rule => {
      if (rule.parent.type === "root") rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    return values;
  };
  const dialog = declarations(".collection-daily-day-details-dialog");
  assert.equal(dialog.height, "auto");
  assert.match(dialog["max-height"], /90dvh/);
  assert.match(dialog["max-height"], /var\(--viewport-min-height-value\) - 2rem/);
  assert.equal(dialog.width, undefined);
  assert.equal(declarations('.collection-daily-day-details-dialog[data-mobile="false"]').width, "min(64rem, calc(100vw - 2rem))");
  assert.equal(declarations(".collection-daily-day-details-scroll").flex, "1 1 auto");
  assert.equal(declarations(".collection-day-record-list")["min-height"], undefined);
});
