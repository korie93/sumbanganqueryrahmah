import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../../..");
const source = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const component = source("client/src/pages/landing-next/LandingNext.tsx");
const motion = source("client/src/pages/landing-next/useLandingNextMotion.ts");
const entry = source("client/src/pages/Landing.tsx");
const stylesheet = postcss.parse(source("client/src/pages/landing-next/landing-next.css"));
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

test("normal landing remains lazy behind the existing low-spec decision and keeps legacy markup", () => {
  assert.match(entry, /const LandingNext = lazy\(\(\) => import\("@\/pages\/landing-next\/LandingNext"\)\)/);
  assert.match(entry, /const motion = useLandingMotion\(\)/);
  const normalStart = entry.indexOf("if (!motion.lowSpec)");
  const legacyStart = entry.indexOf("  return (\n    <LandingNavigationContext");
  assert.ok(normalStart > 0 && legacyStart > normalStart);
  assert.match(entry.slice(normalStart, legacyStart), /<LandingNext\s+onLoginClick=\{onLoginClick\}\s+paused=\{motion\.paused\}/);
  assert.equal(sha256(entry.slice(legacyStart)), "d98ba35c6860014d565b5e00972deea9340111b3867a4ade387311c6b08587cf",
    "The original low-spec landing return remains byte-identical to 44f3c4d3 after newline normalization");
});

test("landing rollout preserves low-spec detection, legacy UI, routes and shared shell source", () => {
  // These are preservation assertions for this rollout, not copied runtime logic.
  const protectedFiles = new Map([
    ["client/src/lib/low-spec-mode.ts", "9a77bca9208adcdd9dc58863ec2b4463d765e0fa0fe175aff8da052453638d80"],
    ["client/src/main.tsx", "41ffea7bb4bbd7bc8d9fd2494051c3d38b6ef5829b95583e725f9999a9ddaf2c"],
    ["client/src/pages/LandingRouteFallback.tsx", "48b2407d32b7e4deebf35fa55e2e2787bcf3c411b963e6d97c726c88191851f9"],
    ["client/src/pages/LandingRouteFallback.css", "bf1cd144114407d23207e5e9c97c3790786773f536da93ce33816d632f36ef45"],
    ["client/public/boot-shell.js", "02cc93aab5145115e32c9cf8a31b870b3e97868c72eccdaec1b439fe0b1eaa8d"],
    ["client/public/boot-shell.css", "7c3ed38ef85cb1253bb0b767d431d631c1d7ebc0c53b786216f752d1c5ae2da1"],
    ["client/src/app/lazy-pages.tsx", "09af4a5b0ccee8a2acfd701e7c493198fb2b9ad8d5426d1d308f4ceac13f32b9"],
    ["client/src/app/routing.ts", "734810c0d91476cd4c92b47adef3fdecfdd29734287bb6992f7748d1ed90a2de"],
    ["client/src/app/document-metadata.ts", "4068ea9e356fca87f858fac7afae91d20430e86e217fc2fa66f33e62395cc0c6"],
    ["client/src/pages/landing-v21/landing-v21.css", "03b9ec52a2fe9db301b58fdb1a2fec4c3a53404b18634b897a4b7c6a5672e4d3"],
    ["client/src/pages/landing-v21/LandingLink.tsx", "6791984223c9da24d645e7b18cd19596f3760d27f6a8398e39e12262f1e2f950"],
    ["client/src/pages/landing-v21/LandingSections.tsx", "02bf70adf4877d751fbbcb99c97ab8b90f86dbba066231c85387f62668046e61"],
    ["client/src/pages/landing-v21/PreviewViews.tsx", "2fa077fbde11762570e39508b06ee0bc6e33d305ae65d444407e4d57d34198c9"],
    ["client/src/pages/landing-v21/ProductPreview.tsx", "27398aaaea54211f8bec61abcedcd6e7411decfeca9f1edfaad9e751b489d680"],
    ["client/src/pages/landing-v21/RelativeDate.tsx", "de029f73892127c3ef82f5d793e3dc699d180bbb3c9116c93b6273de6120869a"],
    ["client/src/pages/landing-v21/TestimonialCarousel.tsx", "a689df9c5bf869915e26aa78ef814ede7387547f3947075233a6d5e3f9533916"],
    ["client/src/pages/landing-v21/testimonials.ts", "bae56178c4ab5ac7bc12535a67ef53ea76e418b44880054ac79b7d6f0ef95796"],
    ["client/src/pages/landing-v21/useLandingMotion.ts", "f7133dcc94a1ede40131030684b78cd16ef4e6854be92ec5533d37368037b186"],
  ]);
  for (const [name, hash] of protectedFiles) assert.equal(sha256(source(name)), hash, name);
});

test("every new landing CSS selector and keyframe stays in its own namespace", () => {
  let rules = 0;
  const keyframes = new Set<string>();
  stylesheet.walkAtRules(rule => {
    assert.ok(["media", "supports", "container", "keyframes", "-webkit-keyframes"].includes(rule.name), rule.name);
    assert.doesNotMatch(rule.params, /https?:|\/\/|url\(/i);
    if (/keyframes$/i.test(rule.name)) {
      assert.match(rule.params, /^sqr-landing-next-[\w-]+$/);
      keyframes.add(rule.params);
    }
  });
  stylesheet.walkRules(rule => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    rules++;
    for (const selector of rule.selectors) {
      assert.match(selector, /^\.sqr-landing-next(?=[\s.#[:]|$)/, selector);
      assert.doesNotMatch(selector, /:global\b|:root\b|(?:^|[\s>+~])(?:html|body)(?=[\s.#[:>+~]|$)/, selector);
      assert.doesNotMatch(selector, /^\.sqr-landing-next(?:[.#][\w-]+|\[[^\]]+\])*\s*[+~]/, selector);
    }
  });
  assert.ok(rules > 0 && keyframes.size > 0);
  stylesheet.walkDecls(declaration => assert.doesNotMatch(declaration.value, /(?:https?:|\/\/|url\s*\()/i));
});

test("public landing is semantic React with local artwork and no protected service dependencies", () => {
  const approved = new Set(["react", "lucide-react", "@shared/brand-assets", "@/lib/aria-state-props", "./useLandingNextMotion", "./landing-next.css"]);
  for (const [name, text] of [["LandingNext.tsx", component], ["useLandingNextMotion.ts", motion]]) {
    const file = ts.createSourceFile(name!, text!, ts.ScriptTarget.Latest, true, name!.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const inspect = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        assert.ok(ts.isStringLiteral(node.moduleSpecifier) && (
          approved.has(node.moduleSpecifier.text)
          || (name === "useLandingNextMotion.ts" && node.moduleSpecifier.text === "@/lib/browser-storage")
        ), node.getText(file));
      }
      if (ts.isCallExpression(node)) {
        assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, "No runtime API or auth loading");
        const method = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
        assert.ok(!["fetch", "sendBeacon", "require", "eval", "setInterval"].includes(method), method);
      }
      if (ts.isNewExpression(node)) assert.ok(!["WebSocket", "XMLHttpRequest", "EventSource", "Function"].includes(node.expression.getText(file)));
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        assert.ok(!["iframe", "script", "style", "svg", "canvas"].includes(node.tagName.getText(file)), node.tagName.getText(file));
      }
      if (ts.isJsxAttribute(node)) {
        assert.notEqual(node.name.getText(file), "dangerouslySetInnerHTML");
        if (["href", "src", "srcSet"].includes(node.name.getText(file)) && node.initializer && ts.isStringLiteral(node.initializer)) {
          assert.match(node.initializer.text, /^(?:#|\/[^/])/, node.initializer.text);
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(file);
    assert.doesNotMatch(text!, /\.innerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/);
  }
  assert.match(component, /href === "\/login"[\s\S]*?event\.preventDefault\(\); navigation\.onLoginClick\(\)/);
  assert.match(component, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(component, /SQR_BRAND_ASSETS\.transparentIcon/);
  assert.match(component, /getAriaExpandedProps\(motion\.menuOpen\)/);
  assert.match(component, /aria-controls="landing-next-mobile-menu"/);
  assert.match(component, /id="landing-next-mobile-menu"/);
  assert.match(component, /width=\{dimension\} height=\{dimension\}/);
});

test("landing theme and motion belong to the local route and clean up on departure", () => {
  assert.match(motion, /const THEME_KEY = "sqr-landing-next-theme"/);
  assert.doesNotMatch(motion, /(?:setItem|removeItem)\(\s*["'](?:theme|perf_mode|user|role|username)["']/);
  assert.doesNotMatch(motion, /document\.documentElement\.(?:classList|dataset|style)/);
  assert.match(motion, /const motionPaused = paused \|\| hidden/);
  assert.match(motion, /if \(!element \|\| hidden\) return/);
  assert.match(motion, /if \(typeof IntersectionObserver !== "function"\)/);
  assert.match(motion, /return \(\) => observer\.disconnect\(\)/);
  assert.match(motion, /if \(frame !== null\) window\.cancelAnimationFrame\(frame\)/);
  assert.match(motion, /if \(replayTimer\.current !== null\) window\.clearTimeout\(replayTimer\.current\)/);
  const methods = [...motion.matchAll(/\.addEventListener\("([^"]+)"/g)].map(match => match[1]);
  assert.ok(methods.length > 0);
  for (const event of methods) assert.ok(motion.includes(`removeEventListener("${event}"`), event);
  const paints = [...motion.matchAll(/const paint = \(\) => \{([\s\S]*?)\n {4}\};/g)];
  assert.ok(paints.length > 0);
  for (const [, body] of paints) assert.doesNotMatch(body!, /requestAnimationFrame/, "RAF is demand-driven, never a self-scheduling idle loop");
});

test("supplied SVG artwork variants stay same-origin, script-free and complete", () => {
  const assets = path.join(root, "client/public/landing-next");
  const names = readdirSync(assets).filter(name => name.endsWith(".svg"));
  const expected = ["radar-static.svg", "radar-animated.svg"];
  for (const name of ["search", "analyse", "import", "monitor", "security"]) {
    for (const theme of ["light", "dark"]) for (const state of ["static", "animated", "boost"]) expected.push(`${name}-${theme}-${state}.svg`);
  }
  assert.deepEqual(names.sort(), expected.sort());
  for (const name of names) {
    const svg = readFileSync(path.join(assets, name), "utf8");
    assert.match(svg, /<svg\b[^>]*\bviewBox=/);
    assert.match(svg, /<style><!\[CDATA\[[\s\S]*?\]\]><\/style>/, "HTML raw-text CSS must remain valid XML inside an external SVG");
    assert.doesNotMatch(svg, /<(?:script|foreignObject|iframe|image)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:|javascript:)|@import/i, name);
    if (name.includes("-static")) assert.match(svg, /animation\s*:\s*none\s*!important/i, name);
  }
});
