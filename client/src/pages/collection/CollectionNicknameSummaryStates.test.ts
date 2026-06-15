import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CollectionNicknameSummaryErrorState,
  CollectionNicknameSummaryLoadingState,
} from "@/pages/collection/CollectionNicknameSummaryStates";

test("CollectionNicknameSummaryLoadingState announces progress", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryLoadingState),
  );

  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Loading nickname summary/);
});

test("CollectionNicknameSummaryErrorState keeps API failures visible and escaped", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionNicknameSummaryErrorState, {
      message: "<script>alert('unsafe')</script>",
    }),
  );

  assert.match(markup, /role="alert"/);
  assert.match(markup, /Nickname summary could not be loaded/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
});
