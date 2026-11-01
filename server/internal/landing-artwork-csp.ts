// Reviewed CSS from the 32 repository-owned landing SVGs. XML normalizes CRLF
// and CR to LF; hash only the style text, excluding its CDATA delimiters.
// Source consistency is verified in frontend-static.test.ts before CI release.
const glyphHashes = {
  "light-animated": "'sha256-cO9yppqLjRybBd1NgA++w4ZwyAK9Akp2/Pl4KAlNrJQ='",
  "light-boost": "'sha256-hv9sv8ii1AL2VabPTMrGCJR3knDv4RO2unDHRgc6JaE='",
  "light-static": "'sha256-Y6shjMACEfk03SBwL5LIVdj5ZvUDjHqlQEX6oj9bv64='",
  "dark-animated": "'sha256-Wm6fzHqgO4XMPLsi4hoRSsgpke6r/acb3SRTirreYhc='",
  "dark-boost": "'sha256-xIYG4vCrvx28sKS6LV+E5PwCmlps9YcV2pIyzoPE3n4='",
  "dark-static": "'sha256-TNTciVK5WlQQWxhOv04WbxUmA3Rt3Ec/ZAcmlB4oq+I='",
} as const;

export const LANDING_ARTWORK_STYLE_HASHES: Readonly<Record<string, string>> = Object.freeze({
  "landing-next/radar-animated.svg": "'sha256-zjXMcKg39drvHK0amWv/CWicTFqhSRjjaZsEakNxc9o='",
  "landing-next/radar-static.svg": "'sha256-axMiSsP/2DTYKnRPio7Cl7UXriCmccGTwwfIRnQRTcI='",
  ...Object.fromEntries(
    ["search", "analyse", "import", "monitor", "security"].flatMap((name) =>
      Object.entries(glyphHashes).map(([variant, hash]) => [`landing-next/${name}-${variant}.svg`, hash])),
  ),
});

/** Approve one exact artwork style on its own static response, never on HTML. */
export function withLandingArtworkStyleHash(
  currentPolicy: string | undefined,
  relativePath: string,
): string | undefined {
  if (!currentPolicy || currentPolicy.includes(",")
    || !Object.prototype.hasOwnProperty.call(LANDING_ARTWORK_STYLE_HASHES, relativePath)) return currentPolicy;

  const directives = currentPolicy.split(";");
  const styleDirectives = directives
    .map((directive, index) => ({ directive, index }))
    .filter(({ directive }) => /^\s*style-src-elem(?:\s|$)/i.test(directive));
  // Do not synthesize a missing policy/directive or change an explicit deny.
  if (styleDirectives.length !== 1) return currentPolicy;
  const { directive, index } = styleDirectives[0];
  const sources = directive.trim().split(/\s+/).slice(1);
  const hash = LANDING_ARTWORK_STYLE_HASHES[relativePath];
  if (!sources.includes("'self'") || sources.includes("'none'") || sources.includes(hash)) return currentPolicy;

  directives[index] = `${directive.trimEnd()} ${hash}`;
  return directives.join(";");
}
