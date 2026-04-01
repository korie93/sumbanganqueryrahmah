import type { ColumnFilter } from "@/pages/viewer/types";

export function appendViewerFilter(previous: ColumnFilter[], headers: string[]) {
  if (headers.length === 0) {
    return previous;
  }

  return [
    ...previous,
    { column: headers[0], operator: "contains", value: "" } satisfies ColumnFilter,
  ];
}

export function updateViewerFilterAt(
  previous: ColumnFilter[],
  index: number,
  field: keyof ColumnFilter,
  value: string,
) {
  return previous.map((filter, filterIndex) =>
    filterIndex === index ? { ...filter, [field]: value } : filter,
  );
}

export function removeViewerFilterAt(previous: ColumnFilter[], index: number) {
  return previous.filter((_, filterIndex) => filterIndex !== index);
}
