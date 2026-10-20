import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import postcss from "postcss";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { GeneralSearchEmptyIllustration } from "./GeneralSearchEmptyIllustration";

const readLocal = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const referenceHtml = readLocal("../../../../docs/design/general-search-enterprise-final/empty-state.html");
const referenceCss = readLocal("../../../../docs/design/general-search-enterprise-final/empty-state.css");
const runtimeCss = readLocal("./general-search-empty.css");
const illustrationSource = readLocal("./GeneralSearchEmptyIllustration.tsx");
const emptyStateSource = readLocal("./GeneralSearchEmptyState.tsx");
const require = createRequire(import.meta.url);

interface SvgNode {
  tag: string;
  attributes: [string, string][];
  children: SvgNode[];
}

// Compare the actual SSR output, not JSX spelling. Attribute order, self-closing
// syntax, HTML comments and indentation are not part of the supplied artwork.
function normalizeSvg(markup: string): SvgNode {
  const source = markup.replace(/<!--[\s\S]*?-->/g, "");
  const roots: SvgNode[] = [];
  const stack: SvgNode[] = [];
  for (const match of source.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attributeText, selfClosing] = match;
    if (closing) {
      assert.equal(stack.pop()?.tag, tag, "SVG element nesting stays valid");
      continue;
    }
    const attributes: [string, string][] = [...attributeText.matchAll(/([\w:-]+)="([^"]*)"/g)]
      .map((attribute) => {
        const name = attribute[1];
        let value = attribute[2].replace(/\s+/g, " ").trim();
        if (name === "style") {
          value = value.split(";").map((declaration) => declaration.trim())
            .filter(Boolean).sort().join(";");
        }
        return [name, value] as [string, string];
      })
      .sort(([left], [right]) => left.localeCompare(right));
    const node: SvgNode = { tag, attributes, children: [] };
    const parent = stack[stack.length - 1];
    (parent ? parent.children : roots).push(node);
    if (!selfClosing) stack.push(node);
  }
  assert.equal(stack.length, 0, "SVG has no unclosed elements");
  assert.equal(roots.length, 1, "Exactly one illustration root is rendered");
  return roots[0];
}

function flattenSvg(node: SvgNode): SvgNode[] {
  return [node, ...node.children.flatMap(flattenSvg)];
}

// CSS imports are Vite concerns; evaluate the real component against React's
// SSR runtime, with only that stylesheet import omitted from this unit harness.
function loadEmptyState(): ComponentType<{ query: string; advancedMode: boolean }> {
  const code = ts.transpileModule(emptyStateSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports: { GeneralSearchEmptyState?: ComponentType<{ query: string; advancedMode: boolean }> } = {};
  runInNewContext(code, {
    exports,
    require: (specifier: string) => {
      if (specifier === "@/pages/general-search/general-search-empty.css") return {};
      if (specifier === "@/pages/general-search/GeneralSearchEmptyIllustration") {
        return { GeneralSearchEmptyIllustration };
      }
      assert.ok(["react", "react/jsx-runtime"].includes(specifier), `Unexpected component dependency: ${specifier}`);
      return require(specifier);
    },
  });
  assert.ok(exports.GeneralSearchEmptyState);
  return exports.GeneralSearchEmptyState;
}

const EmptyState = loadEmptyState();

test("Enterprise FINAL illustration preserves every supplied SVG element, attribute and paint in order", () => {
  const referenceSvg = referenceHtml.match(/<svg viewBox="0 0 360 220"[\s\S]*?<\/svg>/)?.[0];
  assert.ok(referenceSvg, "The canonical package contains its complete illustration");
  const supplied = normalizeSvg(referenceSvg);
  const rendered = normalizeSvg(renderToStaticMarkup(createElement(GeneralSearchEmptyIllustration)));
  assert.deepEqual(rendered, supplied);

  const nodes = flattenSvg(rendered);
  assert.equal(nodes.length, 146);
  const ids = nodes.flatMap((node) => node.attributes.filter(([name]) => name === "id").map(([, value]) => value));
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, ids.length, "The single mounted scene has no duplicate SVG IDs");
  assert.doesNotMatch(illustrationSource, /<script|<foreignObject|https?:\/\/|\bon[A-Z]\w*\s*=/);
});

test("Enterprise FINAL CSS stays identical to its supplied source, including all eleven keyframes", () => {
  const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");
  assert.equal(normalizeLineEndings(runtimeCss), normalizeLineEndings(referenceCss));

  const keyframes = (css: string) => {
    const rules: string[] = [];
    postcss.parse(css).walkAtRules("keyframes", (rule) => { rules.push(rule.toString()); });
    return rules;
  };
  const frames = keyframes(runtimeCss);
  assert.equal(frames.length, 11);
  assert.deepEqual(frames, keyframes(referenceCss));
  assert.deepEqual(frames.map((frame) => frame.match(/^@keyframes\s+(\S+?)\s*\{/)?.[1]), [
    "se-lean", "se-rig", "se-bob", "se-line", "se-fish", "se-alert",
    "se-wait", "se-ring", "se-ring-big", "se-tail", "se-wave",
  ]);
  assert.match(runtimeCss, /\.sqr-empty:not\(\[hidden\]\) \.fish-main\{animation:se-fish 10s ease-in-out infinite\}/);
  assert.match(frames[4], /100%\{transform:translate\(76px,382px\) rotate\(-68deg\)\}/);
});

test("empty-state CSS is component-scoped and reserves important declarations for hidden and reduced-motion states", () => {
  const css = postcss.parse(runtimeCss);
  const important: { property: string; value: string; selector: string }[] = [];
  css.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && rule.parent.name === "keyframes") return;
    for (const selector of rule.selector.split(",")) {
      assert.match(selector, /\.sqr-empty(?:\b|__)/, `Unscoped component selector: ${selector}`);
    }
  });
  css.walkDecls((declaration) => {
    if (!declaration.important) return;
    assert.equal(declaration.parent?.type, "rule");
    const rule = declaration.parent as postcss.Rule;
    important.push({ property: declaration.prop, value: declaration.value, selector: rule.selector });
    if (declaration.prop === "display") {
      assert.equal(rule.selector, ".sqr-empty[hidden]");
      assert.equal(declaration.value, "none");
    } else {
      assert.ok(["animation", "transition"].includes(declaration.prop));
      assert.equal(declaration.value, "none");
      assert.equal(rule.parent?.type, "atrule");
      assert.equal((rule.parent as postcss.AtRule).params, "(prefers-reduced-motion:reduce)");
    }
  });
  assert.equal(important.length, 3);
  assert.match(runtimeCss, /@media\s*\(prefers-reduced-motion:no-preference\)/);
  assert.match(runtimeCss, /@media\(prefers-reduced-motion:reduce\)\{\.sqr-empty \*,\.sqr-empty \*::before,\.sqr-empty \*::after\{animation:none!important;transition:none!important\}\}/);
});

test("empty-state artwork uses the existing global theme bridge and never branches on hardware tier", () => {
  assert.match(runtimeCss, /\[data-theme="light"\] \.sqr-empty,\.sqr-empty\[data-theme="light"\]/);
  assert.match(runtimeCss, /\.sqr-empty\[data-theme="light"\] \.night-only\{display:none\}/);
  assert.match(runtimeCss, /\.sqr-empty\[data-theme="light"\] \.day-only\{display:inline\}/);
  const runtime = `${illustrationSource}\n${emptyStateSource}\n${runtimeCss}`
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(runtime, /detectLowSpec|isLowSpec|hardwareConcurrency|deviceMemory|\bnavigator\b|requestAnimationFrame|setInterval|setTimeout/);
  assert.doesNotMatch(runtime, /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|\bsrcDoc\b/);
  assert.doesNotMatch(runtimeCss, /will-change\s*:/);
});

test("empty-state result copy remains accessible and dynamic queries are React-escaped in both search modes", () => {
  const query = '\"><img src=x onerror="alert(1)"> & <script>unsafe</script>';
  for (const advancedMode of [false, true]) {
    const markup = renderToStaticMarkup(createElement(EmptyState, { query, advancedMode }));
    assert.match(markup, /<section class="sqr-empty" aria-labelledby="([^"]+)" lang="ms"/);
    const titleId = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(titleId && markup.includes(`<h2 class="sqr-empty__title" id="${titleId}">Tiada rekod ditemui</h2>`));
    assert.match(markup, /role="status">Carian selesai\. Tiada rekod ditemui\. 0 padanan\./);
    assert.equal((markup.match(/viewBox="0 0 360 220"/g) ?? []).length, 1);
    assert.match(markup, /class="sqr-empty__art" aria-hidden="true"/);
    assert.match(markup, /<svg viewBox="0 0 360 220" aria-hidden="true" focusable="false"/);
    assert.ok(markup.includes(advancedMode ? "Kriteria carian" : "Kata kunci"));
    assert.match(markup, /&lt;img src=x onerror=/);
    assert.match(markup, /&lt;script&gt;unsafe&lt;\/script&gt;/);
    assert.doesNotMatch(markup, /<img\b|<script\b|<button\b|123456789012/);
  }
});
