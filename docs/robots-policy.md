# Public crawler policy

SQR's `robots.txt` disallows crawling by default and allows only the exact
canonical landing page (`/$`), its public rendering assets, and the sitemap.
It does not enumerate internal module, account-recovery or API routes. New
non-public routes are covered by the default rule without adding their names.

The public resource exceptions are `/assets/`, `/brand/`, the exact boot-shell
JavaScript/CSS files and `site.webmanifest`. These preserve access to the
landing page's scripts, styles, images and icons. Root URLs with query strings
are not separately allowed; the canonical landing URL and sitemap use `/`.

Production generates the response in `server/internal/frontend-static.ts`
before static-file handling, with a five-minute cache policy. The fallback
`client/public/robots.txt` must stay identical when the configured public URL is
`https://sqr-system.com`. The sitemap still contains only the landing page.

This is crawler guidance, not authentication or a guarantee that a URL can
never appear in search results. Non-compliant bots can ignore it, URLs can be
discovered from public JavaScript or external links, and a crawler blocked
from a page cannot read that page's `noindex` metadata. Existing authentication,
role permissions, API guards, page metadata and normal browser navigation are
unchanged. Do not replace those controls with robots rules.

`npm run test:http` includes the frontend-static HTTP regressions, so CI and
Release Verification exercise this policy rather than relying on a manual
check. They verify dynamic/static parity, GET/HEAD responses, cache headers,
root-only sitemap, public asset exceptions and default denial of new routes.

References: [Google's robots.txt specification](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
and [robots.txt limitations](https://developers.google.com/search/docs/crawling-indexing/robots/intro).
