# Viewer numeric ordering

The existing Filters panel contains a **Number order** section. Choose a column and **Smallest first** or **Largest first**. **Default order** restores the original row-ID order. This setting is local to the open Viewer and is reset when switching imports.

Numeric ordering uses the same bounded decimal grammar as numeric filters: plain/grouped decimals, signs and negative values are accepted; empty cells, malformed groups, currency labels and other nonnumeric cells sort last in both directions. Equal numeric values use row ID as a stable tie breaker. String decimals retain exact PostgreSQL precision.

The server applies search, column filters and numeric ordering to the whole authorized import before choosing a page. It does not sort only the browser's current rows. Subsequent pages use the existing opaque cursor format with an anchor constrained to the same filtered import. Query counts cover the complete matching dataset.

Changing the column or direction resets pagination and selection. Request identity includes the sort so obsolete responses, retry actions and exports cannot cross into a different query. All-results CSV, Excel and PDF exports request the same order across their page batches; current-page and selected-row exports retain their displayed order.

The import-data API accepts optional `numericSort={"column":"Amount","direction":"asc"}` (URL encoded). `direction` is `asc` or `desc`; an absent parameter keeps existing behavior. Invalid sort objects and unknown columns must be rejected rather than interpolated into SQL. No schema migration or dependency is needed.
