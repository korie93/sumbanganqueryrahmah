import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackupFiltersPanel } from "./BackupFiltersPanel";

const noop = () => undefined;

test("Backup filter disclosure wraps its description without changing open-state semantics", () => {
  for (const filtersOpen of [false, true]) {
    const markup = renderToStaticMarkup(createElement(BackupFiltersPanel, {
      createdByFilter: "", dateFrom: "", datePreset: "all", dateTo: "", filtersOpen,
      hasActiveFilters: false, onClearFilters: noop, onCreatedByFilterChange: noop,
      onDateFromChange: noop, onDatePresetChange: noop, onDateToChange: noop,
      onFiltersOpenChange: noop, onSearchNameChange: noop, onSortByChange: noop,
      searchName: "", sortBy: "newest",
    }));
    const trigger = markup.match(/<button\b[^>]*>/g)?.find((tag) => tag.includes('data-testid="button-toggle-backup-filters"'));
    assert.ok(trigger);
    assert.match(trigger, /min-w-0 max-w-full/);
    assert.match(trigger, /whitespace-normal/);
    assert.doesNotMatch(trigger, /whitespace-nowrap/);
    assert.match(trigger, new RegExp(`aria-expanded="${filtersOpen}"`));
    assert.match(markup, /Search &amp; Filters/);
    assert.match(markup, /Search backups by name, creator, time period, or sorting\./);
    assert.equal(markup.includes('id="search-name"'), filtersOpen);
  }
});
