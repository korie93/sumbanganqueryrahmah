# Common Shared Modules

Target home for browser-safe shared contracts:

- API payload schemas
- error-code constants
- password policy constants
- collection amount/status helpers
- web-vitals payload schemas
- Trusted Types policy names

Common modules must not read `process.env`, touch the filesystem, import Drizzle
table builders, or depend on server runtime state.
