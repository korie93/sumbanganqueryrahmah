import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LanguageSwitcher } from "./LanguageSwitcher";

test("LanguageSwitcher renders an accessible two-locale control", () => {
  const markup = renderToStaticMarkup(
    createElement(LanguageSwitcher, {
      locale: "ms",
      onLocaleChange: () => undefined,
    }),
  );

  assert.match(markup, /role="group"/);
  assert.match(markup, /aria-label="Pilih bahasa paparan"/);
  assert.match(markup, /aria-pressed="true"[^>]*>Bahasa Melayu/);
  assert.match(markup, /aria-pressed="false"[^>]*>Inggeris/);
  assert.match(markup, /type="button"/);
});
