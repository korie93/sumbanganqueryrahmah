import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const VIEWPORT_STYLES = [
  { packageName: "@radix-ui/react-select", attribute: "data-radix-select-viewport" },
  { packageName: "@radix-ui/react-scroll-area", attribute: "data-radix-scroll-area-viewport" },
];

function readViewportStyle({ packageName, attribute }) {
  // Resolve package metadata only; never import or evaluate dependency code.
  const distributionDirectory = path.dirname(require.resolve(packageName));
  const source = readFileSync(path.join(distributionDirectory, "index.mjs"), "utf8");
  const packageJson = JSON.parse(readFileSync(path.join(distributionDirectory, "../package.json"), "utf8"));
  const candidates = [...source.matchAll(/__html:\s*`([^`]*)`/g)]
    .map((match) => match[1])
    .filter((css) => css.includes(`[${attribute}]`));
  if (candidates.length !== 1) {
    throw new Error(`Expected one static viewport style in ${packageName}; review dependency CSP changes.`);
  }

  const css = candidates[0];
  const reviewedCss = `[${attribute}]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[${attribute}]::-webkit-scrollbar{display:none}`;
  if (css !== reviewedCss) {
    throw new Error(`Viewport CSS changed in ${packageName}; review the exact style before approving its CSP hash.`);
  }

  return {
    packageName,
    version: String(packageJson.version || "unknown"),
    css,
    hash: `'sha256-${createHash("sha256").update(css).digest("base64")}'`,
  };
}

export function generateRadixViewportStyleHashes() {
  const styles = VIEWPORT_STYLES.map(readViewportStyle);
  return { styles, hashes: styles.map((style) => style.hash) };
}

export function extractRadixViewportStyleHashes(source) {
  const arrays = [...source.matchAll(/export const RADIX_VIEWPORT_STYLE_HASHES = \[\r?\n([\s\S]*?)\r?\n\];/g)];
  if (arrays.length !== 1) {
    throw new Error("Expected one RADIX_VIEWPORT_STYLE_HASHES allowlist.");
  }
  const body = arrays[0][1];
  const hashPattern = /"('sha256-[A-Za-z0-9+/]{43}=')"/g;
  const hashes = [...body.matchAll(hashPattern)].map((match) => match[1]);
  if (hashes.length !== 2 || !/^[\s,]*$/.test(body.replace(hashPattern, ""))) {
    throw new Error("Radix viewport allowlist must contain exactly two reviewed SHA-256 hashes.");
  }
  return hashes;
}
