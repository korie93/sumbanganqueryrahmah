import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { SecurityOverview } from "./SecurityOverview";

test("security overview uses only actual two-factor and email presence state", () => {
  const markup = renderToStaticMarkup(createElement(SecurityOverview, {
    twoFactorEnabled: true, twoFactorPendingSetup: false, email: "profile@example.test",
  }));
  assert.match(markup, /Enabled/);
  assert.match(markup, /Account email/);
  assert.match(markup, /Provided/);
  assert.doesNotMatch(markup, /score|progressbar|verified|strong|password configured|profile@example|recovery/i);
});

test("pending setup is not presented as enabled and missing email has an honest next step", () => {
  const markup = renderToStaticMarkup(createElement(SecurityOverview, {
    twoFactorEnabled: false, twoFactorPendingSetup: true, email: "  ",
  }));
  assert.match(markup, /Setup pending/);
  assert.match(markup, /Not provided/);
  assert.match(markup, /Contact your administrator/);
  assert.doesNotMatch(markup, /data-state="enabled"/);
});

test("disabled two-factor state stays explicit", () => {
  const markup = renderToStaticMarkup(createElement(SecurityOverview, { twoFactorEnabled: false, twoFactorPendingSetup: false }));
  assert.match(markup, /Not enabled/);
});
