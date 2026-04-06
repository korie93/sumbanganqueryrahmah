import type { SearchResultRow } from "@/pages/general-search/types";
import { getCellDisplayText } from "@/pages/general-search/utils";

const VIRTUAL_ROW_HEIGHT_PX = 52;
const VIRTUAL_VIEWPORT_HEIGHT_PX = 540;
const VIRTUAL_OVERSCAN_ROWS = 8;

export function buildGeneralSearchResultsRange(
  currentPage: number,
  resultsPerPage: number,
  totalResults: number,
) {
  const totalPages = Math.ceil(totalResults / resultsPerPage);
  const rangeStart = totalResults > 0 ? (currentPage - 1) * resultsPerPage + 1 : 0;
  const rangeEnd = Math.min(currentPage * resultsPerPage, totalResults);

  return { rangeEnd, rangeStart, totalPages };
}

export function buildGeneralSearchPaginationItems(
  currentPage: number,
  totalPages: number,
) {
  const items: Array<number | "ellipsis"> = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const isVisible =
      pageNumber === 1
      || pageNumber === totalPages
      || (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1);

    if (!isVisible) {
      if (pageNumber === currentPage - 2) {
        items.push("ellipsis");
      }
      continue;
    }

    items.push(pageNumber);
  }

  return items;
}

export function buildGeneralSearchVirtualRowsState(
  resultsLength: number,
  isLowSpecMode: boolean,
  tableScrollTop: number,
) {
  const enableVirtualRows = isLowSpecMode && resultsLength > 40;
  const virtualStartRow = enableVirtualRows
    ? Math.max(
        0,
        Math.floor(tableScrollTop / VIRTUAL_ROW_HEIGHT_PX) - VIRTUAL_OVERSCAN_ROWS,
      )
    : 0;
  const virtualVisibleRows = enableVirtualRows
    ? Math.ceil(VIRTUAL_VIEWPORT_HEIGHT_PX / VIRTUAL_ROW_HEIGHT_PX) + VIRTUAL_OVERSCAN_ROWS * 2
    : resultsLength;
  const virtualEndRow = enableVirtualRows
    ? Math.min(resultsLength, virtualStartRow + virtualVisibleRows)
    : resultsLength;
  const topSpacerHeight = enableVirtualRows ? virtualStartRow * VIRTUAL_ROW_HEIGHT_PX : 0;
  const bottomSpacerHeight = enableVirtualRows
    ? Math.max(0, (resultsLength - virtualEndRow) * VIRTUAL_ROW_HEIGHT_PX)
    : 0;

  return {
    bottomSpacerHeight,
    enableVirtualRows,
    topSpacerHeight,
    virtualEndRow,
    virtualStartRow,
  };
}

export function getGeneralSearchPopulatedHeaders(
  headers: string[],
  row: SearchResultRow,
) {
  const populatedHeaders = headers.filter((header) => {
    const safeText = getCellDisplayText(row?.[header]).trim();
    return safeText !== "" && safeText !== "-";
  });

  return populatedHeaders.length > 0 ? populatedHeaders : headers;
}
