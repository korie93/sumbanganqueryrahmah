# Image Optimization Strategy

This repo currently favors predictable delivery over aggressive image tooling. The reviewed baseline is:

- keep decorative icons as SVG or component icons where possible
- prefer modern raster formats such as WebP for large screenshots or marketing-style imagery
- keep PNG fallbacks when transparency or operational tooling still requires them
- declare width and height where practical to reduce layout shift
- lazy-load non-critical imagery below the fold
- avoid embedding oversized base64 images in application code

## Current runtime context

- Client build compression already emits reviewed Brotli sidecars for supported build output.
- CSP currently permits `data:` and `blob:` for images because authenticated receipt previews and canvas/export flows still rely on them.
- Most operational UI imagery in the app is icon-driven rather than large-photo driven, so image optimization should stay selective.

## Recommended asset choices

| Use case | Preferred format | Fallback |
| --- | --- | --- |
| UI icons | SVG / Lucide component | none |
| Uploaded receipts | preserve original reviewed upload path | generated preview where supported |
| Large static screenshots / promotional imagery | WebP | PNG |
| Logos with transparency | SVG if possible | PNG |

## Guardrails

- Do not convert user-uploaded receipt evidence opportunistically during request handling.
- Keep any future image pipeline opt-in and reviewable in CI or build tooling.
- When new large static assets are added, prefer shipping a reviewed WebP plus a compatible fallback rather than relying on browser auto-compression assumptions.
