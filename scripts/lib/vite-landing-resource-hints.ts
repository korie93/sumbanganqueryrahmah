import { normalizePath, type ChunkMetadata, type HtmlTagDescriptor, type Plugin } from "vite";

// Keep the page lazy. Publish inert build-owned URLs so the tiny boot shell can
// fetch this route's assets without waiting for React's dependency waterfall.
export function landingResourceHints(): Plugin {
  return {
    name: "sqr-landing-resource-hints",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const landing = Object.values(context.bundle ?? {}).find(chunk =>
          chunk.type === "chunk"
          && chunk.facadeModuleId
          && normalizePath(chunk.facadeModuleId).endsWith("/client/src/pages/Landing.tsx"));
        if (!landing || landing.type !== "chunk") {
          throw new Error("Landing resource hints require the emitted landing page chunk.");
        }
        const metadata = (landing as typeof landing & { viteMetadata?: ChunkMetadata }).viteMetadata;
        // Include shared static dependencies not already discovered by HTML.
        // Otherwise a tiny late-discovered helper can still delay the whole page.
        const scripts = [...new Set([landing.fileName, ...landing.imports])].filter(fileName =>
          !html.includes(`href="/${fileName}"`) && !html.includes(`src="/${fileName}"`));
        const hints: HtmlTagDescriptor[] = [];
        for (const [name, fileName] of [
          ...scripts.map(fileName => ["sqr-landing-script", fileName]),
          ...Array.from(metadata?.importedCss ?? [], fileName => ["sqr-landing-style", fileName]),
        ]) {
          if (!/^assets\/[A-Za-z0-9_-]+\.(?:js|css)$/.test(fileName)) {
            throw new Error("Landing resource hints require local build asset paths.");
          }
          hints.push({ tag: "meta", attrs: { name, content: `/${fileName}` }, injectTo: "head" });
        }
        return hints;
      },
    },
  };
}
