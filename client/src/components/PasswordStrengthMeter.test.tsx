import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

test("PasswordStrengthMeter exposes an accessible live strength summary", () => {
  const markup = renderToStaticMarkup(
    createElement(PasswordStrengthMeter, {
      id: "test-password-strength",
      password: "Tr0ub4dor&3",
    }),
  );

  assert.match(markup, /id="test-password-strength"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /aria-label="Password strength: Strong"/);
  assert.match(markup, /Kekuatan kata laluan/);
  assert.match(markup, /Kuat/);
  assert.match(markup, /Use 12\+ chars/);
  assert.match(markup, /motion-reduce:transition-none/);
});
