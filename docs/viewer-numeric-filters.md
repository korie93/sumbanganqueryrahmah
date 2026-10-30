# Viewer numeric filters

The Viewer column operator menu includes **Greater than**, **Less than** and **Between**. Greater/less comparisons are strict; Between includes both endpoints and requires a minimum no greater than the maximum. Equal endpoints select that exact numeric value.

Plain decimals, negative numbers and correctly grouped thousands such as `1,000.50` are accepted. Blank or nonnumeric cells never become zero. Currency labels, malformed grouping, hexadecimal, `NaN`, infinity and exponent strings are excluded. Native JSON numbers are compared using their decimal representation. String values retain full decimal precision; no JavaScript floating-point conversion is used for string comparisons.

Both range bounds participate in server requests, pagination resets, retry identity and all-results exports. Incomplete or invalid numeric drafts show inline guidance and stay inactive until valid. Existing text operators remain available. Numeric filters apply to the entire authorized import before counts and pagination; a guarded, parameterized PostgreSQL `CASE` excludes dirty cells before numeric casting. The browser retains server numeric membership instead of re-filtering JSON numbers that may already have been rounded during parsing. No schema migration or dependency is required.

Numeric values are bounded to 256 characters after surrounding ASCII whitespace is removed. This bounds parsing/casting costs and matches browser/server validation. Advanced Search behavior is unchanged.

Cursor pages count the full authorized filtered dataset rather than only the remaining rows after the cursor. This adds one filtered count query per cursor page and keeps the displayed total stable during pagination.

Coverage includes exact decimal matching, validation, filter row accessibility, query identity, range chips, exports, HTTP rejection, parameterized SQL and disposable PostgreSQL. `tests/visual/viewer-numeric-filters.spec.ts` covers desktop and 320px dark layout with synthetic records.
