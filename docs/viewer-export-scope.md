# Viewer export scope labels

The export menu names its existing choices explicitly, with grouped record
counts: **Semua data**, **Semua keputusan carian**, **Paparan halaman ini** and
**Rekod dipilih**. The all-results label follows the existing effective search
or filter state. All-results downloads retain the current server search and
column filters across pages. The current-page choice exports only the loaded
matching rows; selection exports only the selected loaded records.

No export flags, row loading, file generation, permissions or confirmation flow
change. Existing conditional menu choices and test IDs remain. Both the active
More menu/mobile sheet and the maintained standalone menu use the same labels.
Long labels wrap rather than overflow. One short hint explains the page scope;
only page-scope controls reference it for assistive technology. Merely opening
the menu does not start a download.

Verification covers label/count/action-flag unit cases, semantic hint markup,
native desktop/mobile menu navigation, and synthetic CSV contents for each
available scope. No production accounts or customer records are used.
