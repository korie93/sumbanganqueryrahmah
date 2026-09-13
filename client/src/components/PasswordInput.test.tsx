import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordInput } from "./PasswordInput";

for (const variant of ["default", "public-auth"] as const) {
  test(`PasswordInput (${variant}) starts masked and preserves field semantics`, () => {
    const markup = renderToStaticMarkup(createElement(PasswordInput, {
      variant,
      id: "new-password",
      name: "newPassword",
      visibilityLabel: "kata laluan baharu",
      value: "test-only-value",
      onChange() {},
      autoComplete: "new-password",
      "aria-describedby": "password-policy",
      "aria-invalid": "true",
      required: true,
      maxLength: 256,
    }));
    const input = markup.match(/<input\b[^>]*>/)?.[0] ?? "";
    const button = markup.match(/<button\b[^>]*>/)?.[0] ?? "";
    assert.match(input, /type="password"/);
    assert.match(input, /id="new-password"/);
    assert.match(input, /name="newPassword"/);
    assert.match(input, /value="test-only-value"/);
    assert.match(input, /autoComplete="new-password"/i);
    assert.match(input, /aria-describedby="password-policy"/);
    assert.match(input, /aria-invalid="true"/);
    assert.match(input, /required=""/);
    assert.match(input, /maxLength="256"/i);
    assert.match(input, /spellCheck="false"/i);
    assert.match(button, /type="button"/);
    assert.match(button, /aria-controls="new-password"/);
    assert.match(button, /aria-label="Lihat kata laluan baharu"/);
    assert.match(button, /aria-pressed="false"/);
    assert.doesNotMatch(button, /test-only-value/);
    assert.match(markup, /aria-hidden="true" focusable="false"/);
    assert.match(input, variant === "public-auth" ? /public-auth-password-input/ : /pr-28/);
  });
}

test("PasswordInput disables the visibility button while the field is busy", () => {
  const markup = renderToStaticMarkup(createElement(PasswordInput, {
    visibilityLabel: "kata laluan semasa", disabled: true,
  }));
  assert.match(markup, /<input[^>]*disabled=""/);
  assert.match(markup, /<button[^>]*disabled=""/);
  assert.match(markup, /type="password"/);
});

test("PasswordInput generates distinct IDs and associates each control with its own field", () => {
  const markup = renderToStaticMarkup(createElement("div", null,
    createElement(PasswordInput, { name: "newPassword", visibilityLabel: "kata laluan baharu" }),
    createElement(PasswordInput, { name: "confirmPassword", visibilityLabel: "pengesahan kata laluan baharu" }),
  ));
  const ids = [...markup.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  const controls = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.deepEqual(controls, ids);
});
