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
        const emitted = Object.values(context.bundle ?? {});
        const byFileName = new Map(emitted.map(output => [output.fileName, output]));
        const landing = emitted.find(chunk =>
          chunk.type === "chunk"
          && chunk.facadeModuleId
          && normalizePath(chunk.facadeModuleId).endsWith("/client/src/pages/Landing.tsx"));
        if (!landing || landing.type !== "chunk") {
          throw new Error("Landing resource hints require the emitted landing page chunk.");
        }
        const scripts = new Set<string>();
        const styles = new Set<string>();
        const visit = (fileName: string) => {
          if (scripts.has(fileName)) return;
          const chunk = byFileName.get(fileName);
          if (!/^assets\/[A-Za-z0-9_-]+\.js$/.test(fileName) || chunk?.type !== "chunk") {
            throw new Error("Landing resource hints require emitted local build asset paths for scripts.");
          }
          scripts.add(fileName);
          const metadata = (chunk as typeof chunk & { viteMetadata?: ChunkMetadata }).viteMetadata;
          for (const style of metadata?.importedCss ?? []) {
            if (!/^assets\/[A-Za-z0-9_-]+\.css$/.test(style) || byFileName.get(style)?.type !== "asset") {
              throw new Error("Landing resource hints require emitted local build asset paths for stylesheets.");
            }
            styles.add(style);
          }
          // Dynamic imports include other public/private routes. Only the
          // landing's required static closure belongs on this startup path.
          for (const dependency of chunk.imports) visit(dependency);
        };
        visit(landing.fileName);
        // Inert metadata only: the boot shell selects the exact anonymous root
        // route before creating these preference-aware image preloads.
        const hints: HtmlTagDescriptor[] = [
          { tag: "meta", attrs: { name: "sqr-landing-image", content: "/landing-next/radar-animated.svg", media: "(prefers-reduced-motion: no-preference)" }, injectTo: "head" },
          { tag: "meta", attrs: { name: "sqr-landing-image", content: "/landing-next/radar-static.svg", media: "(prefers-reduced-motion: reduce)" }, injectTo: "head" },
        ];
        for (const [name, fileName] of [
          ...Array.from(scripts, fileName => ["sqr-landing-script", fileName]),
          ...Array.from(styles, fileName => ["sqr-landing-style", fileName]),
        ]) {
          if (html.includes(`href="/${fileName}"`) || html.includes(`src="/${fileName}"`)) continue;
          hints.push({ tag: "meta", attrs: { name, content: `/${fileName}` }, injectTo: "head" });
        }
        return hints;
      },
    },
  };
}
