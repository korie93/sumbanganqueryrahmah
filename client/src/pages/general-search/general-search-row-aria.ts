import { getGeneralSearchPopulatedHeaders } from "@/pages/general-search/general-search-results-utils"
import type { SearchResultRow } from "@/pages/general-search/types"
import { getCellDisplayText } from "@/pages/general-search/utils"
import { getGeneralSearchCollectionStatusAriaLabel } from "@/pages/general-search/collection-status"

export function buildGeneralSearchRowAriaLabel(input: {
  headers: string[]
  resultNumber: number
  row: SearchResultRow
}) {
  const populatedHeaders = getGeneralSearchPopulatedHeaders(input.headers, input.row)
  const preview = populatedHeaders.slice(0, 3).map((header) => {
    return `${header}: ${getCellDisplayText(input.row?.[header])}`
  })

  if (preview.length === 0) {
    return `Search result ${input.resultNumber}. ${getGeneralSearchCollectionStatusAriaLabel(input.row)}`
  }

  return `Search result ${input.resultNumber}. ${preview.join(". ")}. ${getGeneralSearchCollectionStatusAriaLabel(input.row)}`
}
