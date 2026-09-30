import { normalizePath, type ChunkMetadata, type HtmlTagDescriptor, type Plugin } from "vite";

// Publish inert build-owned URLs. The boot shell activates them only for an
// anonymous /login request; auth routing and module evaluation remain unchanged.
export function loginResourceHints(): Plugin {
  return {
    name: "sqr-login-resource-hints",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const emitted = Object.values(context.bundle ?? {});
        const byFileName = new Map(emitted.map(output => [output.fileName, output]));
        const login = emitted.find(output => output.type === "chunk"
          && output.facadeModuleId
          && normalizePath(output.facadeModuleId).endsWith("/client/src/pages/Login.tsx"));
        if (!login || login.type !== "chunk") {
          throw new Error("Login resource hints require the emitted login page chunk.");
        }

        const scripts = new Set<string>();
        const styles = new Set<string>();
        const referencedAssets = new Set<string>();
        const visit = (fileName: string) => {
          if (scripts.has(fileName)) return;
          const chunk = byFileName.get(fileName);
          if (!/^assets\/[A-Za-z0-9_-]+\.js$/.test(fileName) || chunk?.type !== "chunk") {
            throw new Error("Login resource hints require emitted local script paths.");
          }
          scripts.add(fileName);
          const metadata = (chunk as typeof chunk & { viteMetadata?: ChunkMetadata }).viteMetadata;
          for (const style of metadata?.importedCss ?? []) {
            if (!/^assets\/[A-Za-z0-9_-]+\.css$/.test(style) || byFileName.get(style)?.type !== "asset") {
              throw new Error("Login resource hints require emitted local stylesheet paths.");
            }
            styles.add(style);
          }
          for (const asset of metadata?.importedAssets ?? []) referencedAssets.add(asset);
          // Never follow dynamicImports: those include authenticated pages.
          for (const dependency of chunk.imports) visit(dependency);
        };
        visit(login.fileName);

        const illustrations = emitted.filter(output => output.type === "asset"
          && (output.originalFileNames ?? []).some(original => {
            const normalized = normalizePath(original);
            return normalized === "src/assets/auth-v17/sqr-illustration.webp"
              || normalized.endsWith("/client/src/assets/auth-v17/sqr-illustration.webp");
          }));
        const illustration = illustrations.length === 1 ? illustrations[0] : undefined;
        if (!illustration || !/^assets\/sqr-illustration-[A-Za-z0-9_-]+\.webp$/.test(illustration.fileName)
          || !referencedAssets.has(illustration.fileName)) {
          throw new Error("Login resource hints require the exact emitted V17 illustration used by login.");
        }

        const hints: HtmlTagDescriptor[] = [];
        for (const [name, fileName] of [
          ["sqr-login-image", illustration.fileName],
          ...Array.from(scripts, fileName => ["sqr-login-script", fileName]),
          ...Array.from(styles, fileName => ["sqr-login-style", fileName]),
        ]) {
          if (html.includes(`href="/${fileName}"`) || html.includes(`src="/${fileName}"`)) continue;
          hints.push({ tag: "meta", attrs: { name, content: `/${fileName}` }, injectTo: "head" });
        }
        return hints;
      },
    },
  };
}
