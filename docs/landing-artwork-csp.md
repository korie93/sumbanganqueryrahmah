# Landing artwork animation and CSP

On 1 November 2026, production release `8d006618` served the animated SVGs
successfully, but their embedded CSS was blocked by `style-src-elem`. Opening
`/landing-next/radar-animated.svg` directly reproduced the browser CSP error:
the required style hash was
`sha256-zjXMcKg39drvHK0amWv/CWicTFqhSRjjaZsEakNxc9o=`. With reduced motion
disabled, the radar beam still had `animation-name: none` and the SVG had no
active animations. A successful image response alone did not verify motion.

`server/internal/landing-artwork-csp.ts` maps the 32 supplied SVG paths to eight
reviewed CSS hashes. `frontend-static.ts` adds only the selected file's hash to
that file's existing `style-src-elem` directive while serving it. HTML, API
responses, other images and unknown filenames receive no additional approval.
Missing policies, explicit denials and multiple policies are left unchanged.
Script and style-attribute restrictions remain unchanged; `unsafe-inline` is
not enabled. The helper performs no filesystem reads or hashing per request.

The source consistency test hashes XML-normalized style text: CRLF/CR becomes
LF and CDATA delimiters are excluded. Changes to any supplied SVG CSS must be
reviewed and its exact hash updated. The SVG bytes, frontend layout, animation
timings, hardware policy and reduced-motion behavior are unchanged by this fix.

## Verification

- 22 focused HTTP/static/pipeline tests passed, including all 32 source hashes,
  exact response scope, unknown CSS rejection, HEAD/304 and unchanged caching.
- Four Playwright cases passed against the actual Express security and static
  middleware using isolated loopback fixtures. The three full-motion cases
  compare native image screenshot bytes over time for the radar and all five
  capability illustrations. Profiles use 390/768/1440px, synthetic 2/4/8 CPU
  cores, and CPU throttling of 4x/2x/1x. These prove movement, not an FPS budget.
- Reduced motion is checked in the direct SVG document and with the static
  image selected by the real landing workflow. The same animated SVG at an
  unreviewed filename remains blocked by CSP.
- Changed server files passed lint. Strict TypeScript checks passed for all
  four changed TypeScript roots (1,434 resolved files; not a full-project check).

Runtime checks used the existing WSL/bwrap sandbox: isolated networking,
allowlisted environment, read-only source/dependencies, scratch-only writes,
one CPU, 768 MiB, no swap, 128 tasks and a 180-second wall limit per invocation.
No dependencies were downloaded. A supplemental server bundle check could not
start because the local Linux dependency snapshot lacks `esbuild/lib/main.js`;
the full build and complete CI suite remain required before deployment.

External receipts and the original production error are retained under
`C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/landing-artwork-csp-20261101/`.
Production must receive this repair through a new verified release;
refreshing the existing release does not add the missing SVG style approval.
