import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { Badge } from "@/components/ui/badge";

test("Badge keeps variant foreground color when compact text sizes override font size", () => {
  const markup = renderToStaticMarkup(
    createElement(Badge, { className: "rounded-full px-2 py-0.5 text-xxs shadow-sm" }, "Active"),
  );

  assert.match(markup, /bg-primary/);
  assert.match(markup, /\[color:hsl\(var\(--primary-foreground\)\)\]/);
  assert.match(markup, /text-xxs/);
});

test("Badge keeps secondary and destructive foreground colors with compact sizes", () => {
  const secondaryMarkup = renderToStaticMarkup(
    createElement(Badge, { variant: "secondary", className: "text-2xs" }, "Role"),
  );
  const destructiveMarkup = renderToStaticMarkup(
    createElement(Badge, { variant: "destructive", className: "text-2xs" }, "Blocked"),
  );

  assert.match(secondaryMarkup, /\[color:hsl\(var\(--secondary-foreground\)\)\]/);
  assert.match(secondaryMarkup, /text-2xs/);
  assert.match(destructiveMarkup, /\[color:hsl\(var\(--destructive-foreground\)\)\]/);
  assert.match(destructiveMarkup, /text-2xs/);
});
