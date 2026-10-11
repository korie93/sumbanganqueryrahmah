import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionSourceMatchField } from "../CollectionSourceMatchField";

const source = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/CollectionSourceMatchField.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

type MatchFieldProps = ComponentProps<typeof CollectionSourceMatchField>;

function field(overrides: Partial<MatchFieldProps> = {}) {
  return CollectionSourceMatchField({
    disabled: false,
    status: "incomplete",
    error: "",
    errorKind: null,
    canRetry: false,
    onRetry: () => undefined,
    ...overrides,
  });
}

function render(overrides: Partial<MatchFieldProps> = {}) {
  return renderToStaticMarkup(field(overrides));
}

type ElementProps = { children?: ReactNode; id?: string; onClick?: () => void; disabled?: boolean };

function descendants(element: ReactElement<ElementProps>): ReactElement<ElementProps>[] {
  return [element, ...Children.toArray(element.props.children)
    .filter(isValidElement<ElementProps>)
    .flatMap(descendants)];
}

test("collection matching UI is compact feedback without a source or coverage panel", () => {
  const markup = render();
  assert.match(markup, /id="save-collection-matching-feedback"/);
  assert.match(markup, /untuk padanan automatik/);
  assert.doesNotMatch(markup, /<section|<h[1-6]|<dl|Auto-matching Saved|Saved Matching|TOTAL DUE|Aging|OSP/);
  assert.doesNotMatch(source, /save-collection-source-file/);
  assert.doesNotMatch(source, /selectedSourceFileId/);
});

test("automatic matching announces one localized polite status without the old action", () => {
  const states: [MatchFieldProps["status"], string][] = [
    ["incomplete", "Lengkapkan identiti"],
    ["waiting", "Menunggu input selesai"],
    ["checking", "Sedang menyemak padanan Saved"],
    ["paused", "Auto-matching dijeda"],
    ["matched", "Padanan Saved ditemui"],
    ["no-match", "Tiada rekod Saved sepadan"],
    ["error", "Padanan tidak dapat disemak"],
  ];
  for (const [status, text] of states) {
    const markup = render({ status });
    assert.ok(markup.includes(text), status);
    assert.equal(markup.match(/role="status"/g)?.length, 1, status);
    assert.match(markup, /id="save-collection-source-match-status"/);
    assert.match(markup, /aria-live="polite" aria-atomic="true"/);
    assert.doesNotMatch(markup, /role="alert"|<button|Semak Auto-matching|Checking\.\.\./);
  }
  assert.match(render({ status: "checking" }), /animate-spin motion-reduce:animate-none/);
});

test("incomplete, waiting, checking and paused states suppress stale errors and match details", () => {
  for (const status of ["incomplete", "waiting", "checking", "paused"] as const) {
    const markup = render({
      status, error: "Stale previous failure", errorKind: "transient", canRetry: true,
    });
    assert.doesNotMatch(markup, /Stale previous failure|Cuba semula|role="alert"|Saved Source September|Abort CP/);
    assert.doesNotMatch(markup, /text-amber|text-emerald/);
  }
});

test("terminal matching outcomes show one explanation and never offer a retry", () => {
  const failures: [NonNullable<MatchFieldProps["errorKind"]>, string][] = [
    ["no-match", "Tiada rekod Saved sepadan"],
    ["no-config", "Tiada source Saved aktif"],
    ["ambiguous", "Lebih daripada satu source atau rekod sepadan"],
    ["access", "Akses semakan padanan tidak dibenarkan"],
    ["other", "Ralat semakan khusus"],
  ];
  for (const [errorKind, text] of failures) {
    const markup = render({
      status: "error", errorKind, error: "Ralat semakan khusus", canRetry: true,
    });
    assert.equal(markup.split(text).length - 1, 1, errorKind);
    assert.doesNotMatch(markup, /<button|Cuba semula/);
    if (errorKind !== "other") assert.doesNotMatch(markup, /Ralat semakan khusus/);
  }
  assert.doesNotMatch(render({ status: "no-match", errorKind: "transient", canRetry: true }), /<button/);
});

test("retry has a visible accessible name and is available only for a retryable transient error", () => {
  const transient: Partial<MatchFieldProps> = { status: "error", errorKind: "transient", canRetry: true };
  const markup = render(transient);
  assert.equal(markup.match(/<button/g)?.length, 1);
  assert.match(markup, /id="save-collection-source-match-retry"/);
  assert.match(markup, /aria-describedby="save-collection-source-match-status"/);
  assert.match(markup, /Cuba semula<\/button>/);
  assert.doesNotMatch(markup, /disabled=""|aria-label=/);
  assert.doesNotMatch(render({ ...transient, canRetry: false }), /<button/);
  assert.match(render({ ...transient, canRetry: false }), /Tunggu sebentar sebelum cuba semula/);
  assert.match(markup, /min-h-11/);
  assert.match(markup, /sm:min-h-11/);
  assert.doesNotMatch(markup, /sm:min-h-8/);
  assert.match(render({ ...transient, disabled: true }), /<button[^>]*disabled=""/);

  let retries = 0;
  const tree = field({ ...transient, onRetry: () => { retries += 1; } });
  const button = descendants(tree).find((element) => element.props.id === "save-collection-source-match-retry");
  assert.ok(button);
  assert.equal(retries, 0, "rendering must not start a new request");
  button.props.onClick?.();
  assert.equal(retries, 1);
});

test("matched status does not imply a completed save or expose source projections", () => {
  const markup = render({ status: "matched" });
  assert.match(markup, /Padanan Saved ditemui/);
  assert.match(markup, /text-emerald-700 dark:text-emerald-300/);
  assert.doesNotMatch(markup, /berjaya disimpan|Collection Saved|<button|<dl|<dd|Calling Date|Cumulative|Abort CP|Matched Card/);
  assert.doesNotMatch(source, /selectedMatch|sourceImportId|sourceFilename|totalDue|projectedCpStatus|cardNumberLast4/);
});

test("compact status stays immediately before actions, outside the sticky bar", () => {
  const page = readFileSync(new URL("../SaveCollectionPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Saved Matching & Coverage|sourceMatchSection|selectedMatch=/);
  assert.equal(page.match(/<CollectionSourceMatchField\b/g)?.length, 1);
  assert.match(page, /<CollectionSourceMatchField[\s\S]*?onRetry=\{state\.sourceMatching\.retryMatching\}\s*\/>\s*<div\s*id="save-collection-actions"/);
  assert.match(page, /disabled=\{state\.submitting \|\| accessSuspended \|\| state\.resetConfirmOpen\}/);
  assert.ok(page.indexOf("<SaveCollectionReadySummary") < page.indexOf("<CollectionSourceMatchField"));
  assert.doesNotMatch(source, /sticky|fixed|createCollectionRecord|parseCollectionAmountToCents/);
});

test("compact matching layout wraps long errors without clamping or hiding information", () => {
  assert.match(source, /min-w-0/);
  assert.match(source, /break-words \[overflow-wrap:anywhere\]/);
  assert.match(source, /text-xs leading-5/);
  assert.match(source, /gap-2 py-2/);
  assert.doesNotMatch(source, /truncate|line-clamp|overflow-hidden/);
  assert.match(source, /dark:text-emerald-300/);
  assert.match(source, /dark:text-amber-300/);
  const markup = render({ status: "error", errorKind: "other", error: '<script>alert("synthetic")</script>' });
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});
