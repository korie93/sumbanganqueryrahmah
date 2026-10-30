# Personal Viewer filter presets

Open **Filters** in a Saved file's Viewer. **Save preset** stores the complete valid column-filter draft and numeric sort under a name. Choose a saved preset and click **Apply** to replace the current filters and numeric sort together. Applying resets pagination and row selection, including when applying the same preset again. Global search stays as entered, and exports follow the resulting search/filter/sort query.

Presets are private to the authenticated internal account ID and the current import file. They persist in PostgreSQL, not browser storage. A file does not automatically apply a preset when opened. Presets do not contain imported rows, selected rows, search terms, visible/reordered columns, page size, density or cursor state. Filter values themselves may contain personal information, so the API always scopes reads and changes to the authenticated owner.

Use **Rename** to change a name or **Delete** to remove a preset after confirmation. Deleting a preset does not alter the current filters. Each account may save ten presets per file; names are limited to sixty characters and names differing only by case cannot coexist in the same scope. Invalid/incomplete filters cannot be saved. A preset referring to a column no longer present in its file cannot be applied; its conditions are never silently dropped.

Backend routes are `/api/imports/:id/viewer-presets` (GET and POST) and `/:presetId` (PATCH name and DELETE). Existing authenticated shared-import read permissions apply; these routes do not grant access to imported rows or other accounts' presets. Owner IDs are never accepted from client payloads. Transaction locks serialize quotas/name checks against concurrent changes, account deletion and import soft deletion. Deleted/banned accounts and deleted imports cannot access presets. Physical account/import deletion cascades; terminal account deletion explicitly removes presets while retaining business evidence.

## Database and backup compatibility

Apply reviewed migration **0065_viewer_filter_presets** with the existing `npm run db:migrate` release process before starting this version in migration mode. Runtime readiness checks require the table. Explicit local bootstrap creates the equivalent schema after users and imports exist. No new package is required.

Existing application backup archives use an explicit legacy payload format and **do not include these personal presets**. Continue using PostgreSQL backups for complete preservation. Removing a file/account also removes its presets; a legacy application archive cannot recover them. This feature does not change the legacy backup format or its existing data coverage.
