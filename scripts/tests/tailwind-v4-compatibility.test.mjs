import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { twMerge } from "tailwind-merge";
import compatibility from "../lib/tailwind-postcss-compat.mjs";
import postcssConfig from "../../postcss.config.js";

const rootFile = (name) => fileURLToPath(new URL(`../../${name}`, import.meta.url));
const source = (name) => readFileSync(rootFile(name), "utf8");
const compile = (name, extra = "") => postcss([
  tailwindcss({ optimize: { minify: false } }), compatibility(),
]).process(source(name) + extra, { from: rootFile(name) });
const compiled = Promise.all([
  compile("client/src/public-shell.css"),
  compile("client/src/index.css", '\n@source inline("space-x-2 space-x-reverse space-y-2 space-y-reverse sm:space-y-4 outline-hidden font-sans shadow-sm ring border");'),
]);

function declarations(root, selector) {
  const values = new Map();
  root.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    for (const declaration of rule.nodes) {
      if (declaration.type === "decl") values.set(declaration.prop, declaration.value);
    }
  });
  return values;
}

test("Tailwind 4 removes the vulnerable glob chain without an audit exception", () => {
  const manifest = JSON.parse(source("package.json"));
  const lock = JSON.parse(source("package-lock.json"));
  assert.equal(manifest.devDependencies.tailwindcss, "4.3.3");
  assert.equal(manifest.devDependencies["@tailwindcss/postcss"], "4.3.3");
  assert.equal(manifest.dependencies["tailwind-merge"], "3.7.0");
  assert.ok(manifest.browserslist.production.includes("Firefox >= 128"));
  for (const name of ["braces", "micromatch", "fast-glob", "chokidar"]) {
    assert.equal(Object.keys(lock.packages).some((key) => key.endsWith(`node_modules/${name}`)), false, `${name} must not remain in the lockfile`);
  }
});

test("real public and authenticated builds preserve bounded sources and one preflight", async () => {
  const [publicResult, privateResult] = await compiled;
  for (const name of ["client/src/public-shell.css", "client/src/index.css"]) {
    assert.match(source(name), /utilities\.css" source\(none\)/);
  }
  const privateEntry = source("client/src/index.css");
  assert.match(privateEntry, /@source not "\.\/\*\*\/\*\.test\.\{ts,tsx\}"/);
  assert.match(privateEntry, /@source not "\.\/pages\/landing-v21"/);
  assert.match(privateEntry, /@source not "\.\/pages\/\{Login,LoginParts,ForgotPassword,ActivateAccount,ActivateAccountParts,ResetPassword,Banned,NotFound\}\.tsx"/);
  const probe = ".min-w-\\[1700px\\]";
  assert.equal(declarations(publicResult.root, probe).size, 0, "Public CSS must not include the billing table");
  assert.equal(declarations(privateResult.root, probe).get("min-width"), "1700px");
  assert.match(publicResult.css, /box-sizing: border-box/);
  assert.equal(declarations(privateResult.root, "html, :host").size, 0);
  privateResult.root.walkDecls("box-sizing", (declaration) => {
    assert.equal(declaration.parent.selector, ".box-border", "Only the explicit box-border utility may set box-sizing in private CSS");
  });
  assert.equal(declarations(privateResult.root, ".lg\\:inline-flex\\!").get("display"), "inline-flex", "Home must remain visible at the desktop breakpoint");
  let homeDesktopMedia = false;
  privateResult.root.walkRules(".lg\\:inline-flex\\!", (rule) => {
    homeDesktopMedia = rule.parent.type === "atrule" && rule.parent.params.includes("64rem")
      && rule.nodes.some((node) => node.prop === "display" && node.important);
  });
  assert.ok(homeDesktopMedia);
  for (const result of [publicResult, privateResult]) {
    result.root.walkDecls(/^--/, (declaration) => {
      assert.ok(!declaration.value.includes(`var(${declaration.prop})`), `Self-referential theme token: ${declaration.prop}`);
    });
  }
});

test("space utilities keep v3 following-sibling margins including hidden and reverse cases", async () => {
  const [, result] = await compiled;
  const suffix = " > :not([hidden]) ~ :not([hidden])";
  const vertical = declarations(result.root, `.space-y-2${suffix}`);
  assert.match(vertical.get("margin-top"), /var\(--spacing-2\).*1 - var\(--tw-space-y-reverse\)/);
  assert.match(vertical.get("margin-bottom"), /var\(--spacing-2\).*var\(--tw-space-y-reverse\)/);
  const horizontal = declarations(result.root, `.space-x-2${suffix}`);
  assert.match(horizontal.get("margin-left"), /1 - var\(--tw-space-x-reverse\)/);
  assert.match(horizontal.get("margin-right"), /var\(--tw-space-x-reverse\)/);
  assert.equal(declarations(result.root, `.space-y-reverse${suffix}`).get("--tw-space-y-reverse"), "1");
  assert.equal(declarations(result.root, `.space-x-reverse${suffix}`).get("--tw-space-x-reverse"), "1");
  assert.ok(declarations(result.root, `.sm\\:space-y-4${suffix}`).has("margin-top"));
  const divide = declarations(result.root, `.divide-y${suffix}`);
  assert.match(divide.get("border-top-width"), /1 - var\(--tw-divide-y-reverse\)/);
  assert.match(divide.get("border-bottom-width"), /var\(--tw-divide-y-reverse\)/);
  assert.ok(declarations(result.root, `.divide-border${suffix}`).has("border-color"));
  assert.doesNotMatch(result.css, /:where\([^\n]*space-[xy]-[^\n]*:not\(:last-child\)/);
  const unrelated = await postcss([compatibility()]).process(":where(.other > :not(:last-child)) { margin-block-end: 1rem }", { from: undefined });
  assert.match(unrelated.css, /margin-block-end/);
  const minified = await postcss([compatibility()]).process(":where(.space-y-2>:not(:last-child)){margin-block-end:1rem}", { from: undefined });
  assert.match(minified.css, /\.space-y-2 > :not\(\[hidden\]\) ~ :not\(\[hidden\]\)/);
  assert.match(minified.css, /margin-top:1rem/);
  const grouped = await postcss([compatibility()]).process(":where(.space-y-2>:not(:last-child)), :where(.other>:not(:last-child)) { margin-block-end: 1rem }", { from: undefined });
  assert.equal(declarations(grouped.root, `.space-y-2${suffix}`).get("margin-top"), "1rem");
  assert.equal(declarations(grouped.root, ":where(.other>:not(:last-child))").get("margin-block-end"), "1rem");
});

test("v3 utility colors, shadows, radius and accessible outline survive theme token collisions", async () => {
  const [publicResult, privateResult] = await compiled;
  assert.equal(declarations(publicResult.root, ".text-green-700").get("color"), "#15803d");
  assert.equal(declarations(privateResult.root, ".p-4").get("padding"), "var(--spacing-4)");
  assert.equal(declarations(privateResult.root, ".rounded-md").get("border-radius"), "var(--radius-control)");
  assert.equal(declarations(privateResult.root, ".font-sans").get("font-family"), "var(--font-sans)");
  const shadow = declarations(privateResult.root, ".shadow-sm").get("--tw-shadow");
  assert.match(shadow, /0 1px 2px/);
  assert.doesNotMatch(shadow, /var\(--shadow-sm/);
  const outline = declarations(privateResult.root, ".outline-hidden");
  assert.ok(outline.has("outline-style") || outline.has("outline"));
  assert.match(privateResult.css, /forced-colors: active/);
  assert.match(declarations(privateResult.root, ".ring").get("--tw-ring-shadow"), /3px/);
  assert.match(declarations(privateResult.root, ".bg-linear-to-br\\/srgb").get("--tw-gradient-position"), /in srgb$/);
});

test("production PostCSS pipeline preserves sibling layouts, semantic alpha and default ring color", async () => {
  // Use the real optimize:false pipeline, not the optimized compiler used above
  // to make selector assertions readable. Vite performs optimization afterwards.
  const result = await postcss(postcssConfig.plugins).process(
    source("client/src/index.css")
      + '\n@source inline("ring space-y-2 divide-y divide-x bg-foreground/70");',
    { from: rootFile("client/src/index.css") },
  );
  const suffix = " > :not([hidden]) ~ :not([hidden])";
  assert.match(declarations(result.root, `.space-y-2${suffix}`).get("margin-top"), /1 - var\(--tw-space-y-reverse\)/);
  assert.match(declarations(result.root, `.divide-y${suffix}`).get("border-top-width"), /1 - var\(--tw-divide-y-reverse\)/);
  assert.match(declarations(result.root, `.divide-x${suffix}`).get("border-left-width"), /1 - var\(--tw-divide-x-reverse\)/);
  assert.equal(declarations(result.root, ".bg-foreground\\/70").get("background-color"), "hsl(var(--foreground) / 0.7)");
  const ringShadow = declarations(result.root, ".ring").get("--tw-ring-shadow");
  result.root.walkDecls(/^--tw-(enter|exit)-translate-[xy]$/, (declaration) => {
    assert.doesNotMatch(declaration.value, /^-var\(/, "Negative token distances must use valid calc() math");
  });
  assert.match(ringShadow, /3px/);
  assert.match(ringShadow, /var\(--tw-ring-color,\s*rgb\(59 130 246 \/ 0\.5\)\)/,
    "An uncolored focus ring keeps v3 blue-500/50 rather than falling back to currentColor");
  assert.doesNotMatch(result.css, /:where\([^\n]*(?:space-[xy]-|divide-)[^\n]*:not\(:last-child\)/);
});

test("centered modal primitives use transform centering compatible with enter/exit keyframes", async () => {
  for (const component of ["dialog", "alert-dialog"]) {
    const markup = source(`client/src/components/ui/${component}.tsx`);
    const classes = markup.match(/`(fixed left-\[50%\][^`]+)`/)?.[1];
    assert.ok(classes, `${component} content classes must be checked`);
    assert.ok(classes.includes("[transform:translate(-50%,-50%)]"));
    assert.doesNotMatch(classes, /(?:^|\s)-?translate-[xy]-/,
      "Individual translate would add a second half-width offset to plugin transform animations");
    assert.ok(classes.includes("data-[state=open]:slide-in-from-left-1/2"));
    assert.ok(classes.includes("data-[state=closed]:slide-out-to-left-1/2"));
  }
  const [, result] = await compiled;
  let centering;
  result.root.walkRules((rule) => {
    if (rule.selectors.some((selector) => selector.replace(/\\(.)/g, "$1") === ".[transform:translate(-50%,-50%)]")) {
      centering = new Map(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
    }
  });
  assert.match(centering?.get("transform"), /^translate\(-50%,\s*-50%\)$/);
  assert.equal(centering.has("translate"), false);
});

test("Tailwind merge handles v4 important utilities and Radix explicit CSS variables", () => {
  assert.equal(twMerge("hidden! inline-flex!"), "inline-flex!");
  assert.equal(twMerge("outline-none outline-hidden"), "outline-hidden");
  assert.equal(twMerge("max-h-96 max-h-[var(--radix-select-content-available-height)]"), "max-h-[var(--radix-select-content-available-height)]");
});

test("animation defaults cannot erase explicit modifiers under different data variant orders", async () => {
  const result = await postcss([compatibility()]).process(`
    .side[data-side=bottom] { --tw-enter-translate-y: -8px }
    .animate[data-state=open] { animation-name: enter; animation-duration: 150ms; --tw-enter-translate-y: initial; --tw-enter-scale: initial }
  `, { from: undefined });
  assert.equal(declarations(result.root, ":where(.animate[data-state=open])").get("--tw-enter-translate-y"), "initial");
  assert.equal(declarations(result.root, ".animate[data-state=open]").has("--tw-enter-translate-y"), false);
  assert.equal(declarations(result.root, ".animate[data-state=open]").get("animation-duration"), "150ms");
  assert.equal(declarations(result.root, ".side[data-side=bottom]").get("--tw-enter-translate-y").trim(), "-8px");
});

test("opaque semantic HSL opacity stays equivalent without redundant color-mix fallbacks", async () => {
  const result = await postcss([compatibility()]).process(`
    .valid { color: color-mix(in oklab, hsl(var(--foreground) / 1) 70%, transparent) }
    .alpha { color: color-mix(in oklab, hsl(var(--foreground) / .5) 70%, transparent) }
    .other { color: color-mix(in oklab, red 70%, blue) }
    .wrapped {
      color: hsl(var(--foreground) / 1);
      @supports (color: color-mix(in lab, red, red)) {
        color: color-mix(in oklab, hsl(var(--foreground) / 1) 70%, transparent);
      }
    }
  `, { from: undefined });
  assert.equal(declarations(result.root, ".valid").get("color"), "hsl(var(--foreground) / 0.7)");
  assert.match(declarations(result.root, ".alpha").get("color"), /color-mix/);
  assert.match(declarations(result.root, ".other").get("color"), /color-mix/);
  assert.equal(declarations(result.root, ".wrapped").get("color"), "hsl(var(--foreground) / 0.7)");
  result.root.walkRules(".wrapped", (rule) => assert.equal(rule.nodes.length, 1));
});
