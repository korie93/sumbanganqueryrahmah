# Frontend Performance Notes

## Font Strategy

The app currently uses the system font stack defined in `client/src/theme-tokens.css`:

- `system-ui`
- `-apple-system`
- `BlinkMacSystemFont`
- `"Segoe UI"`
- `sans-serif`

Because we do not ship custom `@font-face` webfonts in the current build, there is no `font-display` decision to apply in CSS right now. Keeping the system stack avoids extra font network requests, removes flash-of-invisible-text risk, and keeps first render predictable on low-spec devices.

If we introduce hosted webfonts later, `font-display: swap` should be the default starting point unless product requirements justify a stricter tradeoff.
