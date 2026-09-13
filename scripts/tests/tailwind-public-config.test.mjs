import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const require = createRequire(import.meta.url);
const tailwindPublicConfig = require("../../tailwind.public.config.cjs");
const semanticTokensSource = readFileSync(
  new URL("../../client/src/styles/tokens/colors/_semantic.css", import.meta.url),
  "utf8",
);
const expectedStatusColors = {
  online: "hsl(var(--status-online) / <alpha-value>)",
  away: "hsl(var(--status-away) / <alpha-value>)",
  busy: "hsl(var(--status-busy) / <alpha-value>)",
  offline: "hsl(var(--status-offline) / <alpha-value>)",
};

const normalizePattern = (pattern) => pattern.replace(/^\.\//, "").replaceAll("\\", "/");
const normalizePath = (filePath) => filePath.replaceAll("\\", "/");

function isCoveredByPublicTailwind(filePath) {
  const normalizedPath = normalizePath(filePath);
  return tailwindPublicConfig.content.some((pattern) =>
    matchesGlob(normalizedPath, normalizePattern(pattern)),
  );
}

const requiredPublicAuthComponents = [
  "client/src/components/PublicAuthLayout.tsx",
  "client/src/components/PublicAuthControls.tsx",
  "client/src/components/PasswordInput.tsx",
  "client/src/components/PasswordRequirementsChecklist.tsx",
  "client/src/components/PasswordStrengthMeter.tsx",
  "client/src/components/PasswordConfirmationFeedback.tsx",
];

test("public Tailwind covers shared auth components without scanning the authenticated application", () => {
  for (const filePath of requiredPublicAuthComponents) {
    assert.equal(
      tailwindPublicConfig.content.includes(`./${filePath}`),
      true,
      `${filePath} requires explicit public CSS coverage`,
    );
  }
  for (const filePath of [
    "client/src/components/NavigationBar.tsx",
    "client/src/components/ui/sidebar.tsx",
    "client/src/pages/settings/MyAccountSecurityCard.tsx",
    "client/src/pages/collection-report/CollectionNicknameDialogStepFields.tsx",
    "client/src/pages/BillingPrincipal.tsx",
  ]) {
    assert.equal(isCoveredByPublicTailwind(filePath), false, `${filePath} must not broaden public CSS`);
  }
  for (const pattern of tailwindPublicConfig.content) {
    assert.doesNotMatch(pattern, /\/components\/.*\*/, "Public shared component coverage must remain an explicit allowlist");
  }
});

test("compiled public CSS includes real password component layout and state declarations", async () => {
  // Compile the actual public entry, including its @config directive, rather
  // than scanning fabricated inline content or borrowing authenticated CSS.
  const publicCssFile = fileURLToPath(new URL("../../client/src/public-shell.css", import.meta.url));
  const compiled = await postcss([tailwindcss()]).process(readFileSync(publicCssFile, "utf8"), {
    from: publicCssFile,
  });
  const declarationsBySelector = new Map();
  compiled.root.walkRules((rule) => {
    const declarations = declarationsBySelector.get(rule.selector) ?? new Map();
    rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value));
    declarationsBySelector.set(rule.selector, declarations);
  });
  for (const [selector, property, expectedValue] of [
    [".absolute", "position", "absolute"],
    [".inset-y-0", "top", "0px"],
    [".inset-y-0", "bottom", "0px"],
    [".w-28", "width", "7rem"],
    [".h-4", "height", "1rem"],
    [".w-4", "width", "1rem"],
    [".shrink-0", "flex-shrink", "0"],
    [".grid-cols-5", "grid-template-columns", "repeat(5, minmax(0, 1fr))"],
    [".grid-cols-\\[minmax\\(0\\2c 1fr\\)_6rem\\]", "grid-template-columns", "minmax(0,1fr) 6rem"],
    [".min-h-10", "min-height", "2.5rem"],
    [".sr-only", "position", "absolute"],
    [".sr-only", "width", "1px"],
    [".sr-only", "height", "1px"],
    [".sr-only", "padding", "0"],
    [".sr-only", "margin", "-1px"],
    [".sr-only", "overflow", "hidden"],
    [".sr-only", "clip", "rect(0, 0, 0, 0)"],
    [".sr-only", "white-space", "nowrap"],
    [".sr-only", "border-width", "0"],
    [".text-green-700", "color", /rgb\(21 128 61\b/],
    [".text-red-700", "color", /rgb\(185 28 28\b/],
    [".bg-red-700", "background-color", /rgb\(185 28 28\b/],
    [".bg-amber-700", "background-color", /rgb\(180 83 9\b/],
    [".bg-green-600", "background-color", /rgb\(22 163 74\b/],
    [".bg-green-800", "background-color", /rgb\(22 101 52\b/],
    [".bg-orange-700", "background-color", /rgb\(194 65 12\b/],
    [".bg-yellow-700", "background-color", /rgb\(161 98 7\b/],
    [".bg-lime-700", "background-color", /rgb\(77 124 15\b/],
    [".bg-green-700", "background-color", /rgb\(21 128 61\b/],
  ]) {
    const value = declarationsBySelector.get(selector)?.get(property);
    assert.ok(value, `${selector} must emit ${property} in the public bundle`);
    if (expectedValue instanceof RegExp) assert.match(value, expectedValue);
    else assert.equal(value, expectedValue);
  }
  assert.notEqual(declarationsBySelector.get(".sr-only").get("display"), "none", "Checklist state labels stay available to assistive technology");
  for (const [selector, property, expectedColor] of [
    [".dark\\:text-green-200:where(.dark, .dark *)", "color", /rgb\(187 247 208\b/],
    [".dark\\:bg-amber-400:where(.dark, .dark *)", "background-color", /rgb\(251 191 36\b/],
    [".dark\\:bg-green-400:where(.dark, .dark *)", "background-color", /rgb\(74 222 128\b/],
    [".dark\\:bg-green-300:where(.dark, .dark *)", "background-color", /rgb\(134 239 172\b/],
  ]) {
    const value = declarationsBySelector.get(selector)?.get(property);
    assert.ok(value, `${selector} must ship the dark checklist state`);
    assert.match(value, expectedColor);
  }

  // This stylesheet is directly imported by public auth controls, not by the
  // authenticated entry. Together with absolute/inset-y-0/w-28 above, its
  // 3rem input height gives the toggle a 48px target at the default root size,
  // exceeding the 44px minimum. Browser tests verify the computed dimensions.
  const controlsCssFile = fileURLToPath(new URL("../../client/src/components/PublicAuthControls.css", import.meta.url));
  const controlsCss = await postcss([]).process(readFileSync(controlsCssFile, "utf8"), { from: controlsCssFile });
  const publicControlMinimumHeights = new Map();
  controlsCss.root.walkRules((rule) => {
    if (rule.selector === ".public-auth-input" || rule.selector === ".public-auth-button") {
      rule.walkDecls("min-height", (declaration) => publicControlMinimumHeights.set(rule.selector, declaration.value));
    }
  });
  assert.equal(publicControlMinimumHeights.get(".public-auth-input"), "3rem", "Password visibility target must retain at least 44px height");
  assert.equal(publicControlMinimumHeights.get(".public-auth-button"), "3rem", "Public submit target must retain at least 44px height");
  for (const [state, color] of [["success", "#bbf7d0"], ["error", "#fecaca"]]) {
    let darkInputToken;
    controlsCss.root.walkRules(`.dark .password-creation-form .public-auth-input[data-validation-state="${state}"]`, (rule) => {
      rule.walkDecls("--dm-input-border", (declaration) => { darkInputToken = declaration.value; });
    });
    assert.equal(darkInputToken, color, "Validated password fields must supply the token consumed by the shared important dark border rule");
  }
  assert.match(
    readFileSync(new URL("../../client/src/components/PublicAuthControls.tsx", import.meta.url), "utf8"),
    /import "\.\/PublicAuthControls\.css";/,
    "Public controls must load their target sizing without the authenticated stylesheet",
  );
});

test("browser auth fixture does not mask public CSS omissions with an eager authenticated stylesheet", () => {
  const fixtureSource = readFileSync(new URL("../fixtures/auth-feedback-ui.jsx", import.meta.url), "utf8");
  assert.match(fixtureSource, /import "\.\.\/\.\.\/client\/src\/public-shell\.css";/);
  assert.doesNotMatch(fixtureSource, /import\s+["']\.\.\/\.\.\/client\/src\/index\.css["']/);
  assert.match(
    fixtureSource,
    /if \(view === "collection" \|\| view === "setup" \|\| view === "settings"\)\s*\{\s*await import\("\.\.\/\.\.\/client\/src\/index\.css"\);\s*\}/,
  );
  assert.ok(
    fixtureSource.indexOf('await import("../../client/src/index.css")') < fixtureSource.indexOf("const root = createRoot"),
    "Authenticated harnesses wait for their stylesheet before rendering",
  );
});

test("tailwind public config covers all landing route files", () => {
  const requiredLandingFiles = [
    "client/src/pages/Landing.tsx",
    "client/src/pages/LandingHeroShell.tsx",
    "client/src/pages/LandingDeferredSections.tsx",
    "client/src/pages/LandingRouteFallback.tsx",
    "client/src/pages/LandingHeroInsightStrip.tsx",
    "client/src/pages/LandingProductPreview.tsx",
  ];

  for (const filePath of requiredLandingFiles) {
    assert.equal(
      isCoveredByPublicTailwind(filePath),
      true,
      `${filePath} must be included in tailwind.public.config.cjs content globs`,
    );
  }
});

test("tailwind public config still covers public auth route files", () => {
  const requiredPublicRouteFiles = [
    "client/src/pages/Login.tsx",
    "client/src/pages/LoginParts.tsx",
    "client/src/pages/ForgotPassword.tsx",
    "client/src/pages/ActivateAccount.tsx",
    "client/src/pages/ActivateAccountParts.tsx",
    "client/src/pages/ResetPassword.tsx",
    "client/src/pages/ChangePassword.tsx",
    "client/src/pages/Maintenance.tsx",
    "client/src/pages/Banned.tsx",
  ];

  for (const filePath of requiredPublicRouteFiles) {
    assert.equal(
      isCoveredByPublicTailwind(filePath),
      true,
      `${filePath} must stay included in tailwind.public.config.cjs content globs`,
    );
  }
});

test("tailwind public config uses shared status color tokens", () => {
  assert.deepEqual(
    tailwindPublicConfig.theme.extend.colors.status,
    expectedStatusColors,
  );

  for (const tokenName of Object.keys(expectedStatusColors)) {
    assert.match(
      semanticTokensSource,
      new RegExp(`--status-${tokenName}:\\s*\\d`),
      `--status-${tokenName} must be defined in semantic color tokens`,
    );
  }
});
