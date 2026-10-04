/**
 * Keep the existing space-between layout contract during the v4 compiler change.
 * v4 moves margins from following siblings to preceding siblings and lowers
 * specificity with :where(). That changes inline labels, reversed flex rows and
 * hidden children throughout existing SQR forms. Keep v3 sibling semantics while
 * leaving v4 scanning, utilities and security fixes intact. Covered with actual
 * compiled CSS and browser snapshots; remove only with an explicit layout change.
 */
export default function tailwindPostcssCompatibility() {
  return {
    postcssPlugin: "sqr-tailwind-compatibility",
    OnceExit(root) {
      const simplifiedColors = new WeakSet();
      // For an opaque HSL token mixed only with transparent, the percentage is
      // exactly its alpha. Keep v3's compact HSL form; otherwise the optimizer
      // emits duplicate fallback/@supports rules for every semantic utility.
      // Do not rewrite arbitrary color mixes or tokens with an existing alpha.
      root.walkDecls((declaration) => {
        // The legacy animate plugin prefixes token-backed distances with '-'.
        // -var(...) is not valid CSS math; v4 does not normalize it for plugins.
        if (/^--tw-(enter|exit)-translate-[xy]$/.test(declaration.prop)) {
          declaration.value = declaration.value.replace(/^-var\((--[a-z0-9_-]+)\)$/, "calc(var($1) * -1)");
        }
        const originalValue = declaration.value;
        declaration.value = originalValue.replace(
          /color-mix\(in oklab,\s*hsl\(var\((--[a-z0-9-]+)\)\s*\/\s*1\)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g,
          (original, token, percent) => Number(percent) <= 100
            ? `hsl(var(${token}) / ${Number(percent) / 100})`
            : original,
        );
        if (declaration.value !== originalValue) simplifiedColors.add(declaration);
      });
      // The compiler wraps dynamic mixes in a color-mix support check. Once all
      // its declarations are plain HSL, remove only that now-redundant wrapper
      // and its immediately preceding opaque fallback. Other supports stay intact.
      root.walkAtRules("supports", (rule) => {
        if (rule.params.replace(/\s/g, "") !== "(color:color-mix(inlab,red,red))"
          || !rule.nodes?.length || !rule.nodes.every((node) => simplifiedColors.has(node))) return;
        const previous = rule.prev();
        if (rule.nodes.length === 1 && previous?.type === "decl"
          && previous.prop === rule.nodes[0].prop
          && previous.value === rule.nodes[0].value.replace(/\/ [\d.]+\)$/, "/ 1)")) previous.remove();
        rule.replaceWith(...rule.nodes);
      });
      root.walkRules((rule) => {
        // v4 sorts data-side/state/swipe variants differently. Animate's default
        // resets must not erase an explicit slide/fade/zoom modifier on the same
        // element, regardless of variant order. Keep resets local (not inherited)
        // at zero specificity; preserve animation name/duration specificity.
        if (rule.nodes.some((node) => node.type === "decl"
          && node.prop === "animation-name" && /^(enter|exit)$/.test(node.value))) {
          const resets = rule.nodes.filter((node) => node.type === "decl"
            && /^--tw-(enter|exit)-(opacity|scale|rotate|translate-[xy])$/.test(node.prop)
            && node.value === "initial");
          if (resets.length) {
            const defaults = rule.cloneBefore({ nodes: [], selectors: rule.selectors.map((selector) => `:where(${selector})`) });
            defaults.append(...resets);
          }
        }
        const converted = [];
        const untouched = [];
        for (const selector of rule.selectors) {
          const match = selector.match(/^:where\((.+?)\s*>\s*:not\(:last-child\)\)$/);
          if (match && /\b(?:space-[xy]-|divide-)/.test(match[1])) {
            converted.push(`${match[1]} > :not([hidden]) ~ :not([hidden])`);
          } else untouched.push(selector);
        }
        if (!converted.length) return;
        const target = untouched.length ? rule.cloneBefore({ selectors: converted }) : rule;
        target.selectors = converted;
        if (untouched.length) rule.selectors = untouched;
        const oldMargins = {
          "margin-block-start": "margin-bottom",
          "margin-block-end": "margin-top",
          "margin-inline-start": "margin-right",
          "margin-inline-end": "margin-left",
          "border-block-start-width": "border-bottom-width",
          "border-block-end-width": "border-top-width",
          "border-inline-start-width": "border-right-width",
          "border-inline-end-width": "border-left-width",
          "border-top-width": "border-bottom-width",
          "border-bottom-width": "border-top-width",
          "border-left-width": "border-right-width",
          "border-right-width": "border-left-width",
        };
        target.walkDecls((declaration) => {
          if (oldMargins[declaration.prop]) declaration.prop = oldMargins[declaration.prop];
        });
      });
    },
  };
}
