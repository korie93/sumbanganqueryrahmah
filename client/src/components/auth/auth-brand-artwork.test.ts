import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const assetHook = registerHooks({
  load(url, context, nextLoad) {
    if (/\.(?:css|webp)$/.test(url)) return {
      format: "module", shortCircuit: true,
      source: `export default ${JSON.stringify(new URL(url).pathname)};`,
    };
    return nextLoad(url, context);
  },
});
const { AuthBrandArtwork } = await import("./AuthBrandArtwork");
assetHook.deregister();

test("both prefetched auth scenes reserve dimensions and stay hidden until decoded in either palette", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const recoveryArtwork of [false, true]) {
      const markup = renderToStaticMarkup(createElement(AuthBrandArtwork, { theme, recoveryArtwork }));
      const images = markup.match(/<img\b[^>]*>/g) ?? [];
      assert.equal(images.length, 2);
      assert.match(markup, /class="auth-v17-art auth-brand-artwork" aria-hidden="true"/);
      for (const image of images) {
        assert.match(image, /alt="" aria-hidden="true" loading="eager" decoding="async" fetchpriority="low"/);
        assert.doesNotMatch(image, /tabindex|fetchPriority=/);
      }
      assert.match(images[0], theme === "dark" ? /sqr-illustration-dark\.webp.*width="1359" height="1157"/
        : /sqr-illustration\.webp.*width="1780" height="1516"/);
      assert.match(images[1], new RegExp(`src="/illustrations/reset-password-${theme}\\.webp" width="640" height="640"`));
      assert.match(images[1], /class="auth-v17-recovery-illustration"/);
      for (const image of images) assert.match(image, /data-active="false"/);
      assert.doesNotMatch(markup, /data-active="true"/);
    }
  }
});
