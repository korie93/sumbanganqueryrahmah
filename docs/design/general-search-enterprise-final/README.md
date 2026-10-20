# General Search Enterprise FINAL source reference

These two files are the user's supplied empty-state markup and stylesheet from
`SQR_Enterprise_FINAL_Premium_Implementation.zip`, not a second application or a
new production route. The full demonstration shell/search simulator is deliberately
not integrated. Source ZIP SHA256:
`70067622AF0CE85D51666C5E7F0D784798EAD81FBE674F78EA40D63C6CE0A813`.

Original filenames:

- `empty-state.html`: `SQR_Empty_State_Enterprise_FINAL_Premium.html`
- `empty-state.css`: `SQR_Empty_State_Enterprise_FINAL_Premium.css`

The files are preserved as text (repository line endings may differ from the ZIP).
The runtime stylesheet is identical after line-ending normalization. The SVG was
mechanically converted to static React JSX, retaining all 146 elements, nine IDs,
attributes, geometry, paint, order and original CSS custom properties. It is only
mounted once at the General Search results boundary. No asset was redrawn.

## Integration

`GeneralSearchEmptyState.tsx` is shown only for an accepted successful response
with zero rows and zero total matching the current effective input. The keyword
or advanced criteria are React text, not HTML. The current request cancellation,
refresh cadence, API contracts, backend, paging, data and role checks are unchanged.
An export error does not remove previously accepted populated results.

The existing global `html[data-theme]` selects the supplied light palette; dark
uses the original defaults. The original scoped 365/760/980px breakpoints have an
exact-file exception in the repository breakpoint contract. They are not allowed
in other General Search or workspace stylesheets.

All eleven original keyframes and the ten-second fish story remain intact. The
global low-spec animation reset excludes only this `.sqr-empty` subtree. Its
transform/opacity-only CSS animations use no JS timer or hardware detection;
`prefers-reduced-motion: reduce` always disables them. No new dependencies.

## Reproduce local QA

Run heavy commands serially. No running backend, `.env` or database is required:

```sh
npm run build
node scripts/test-visual-built.mjs --grep "General search empty" --workers=1
node scripts/test-visual-built.mjs --grep "General search layout" --workers=1
node scripts/general-search-empty-visual.mjs
node scripts/lib/general-search-empty-fixture.mjs --port 5199
```

The last command opens a loopback-only synthetic API boundary around the actual
built app. Visit `http://127.0.0.1:5199/general-search`, enter any valid keyword and
search. It always returns synthetic zero results. No demo controls or bypasses are
added to application code. Stop the process with Ctrl+C when the preview is no
longer needed.

The visual comparison runner captures source/implementation pairs under strict
production-like CSP and Trusted Types, at matching panel widths, themes, viewport
sizes and reduced-motion state. Evidence is ignored under
`artifacts/enterprise-empty/visual/`. The full review is appended to root
`design-qa.md`; continuation status is in
`CODEX_CONTINUATION_HANDOFF_GENERAL_SEARCH_ENTERPRISE_EMPTY.md`.
