import { AppPaginationBar } from "@/components/data/AppPaginationBar";

type CollectionPaginationBarProps = {
  disabled?: boolean;
  loading?: boolean;
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions: number[];
  totalItems: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function CollectionPaginationBar({
  disabled = false,
  loading = false,
  page,
  totalPages,
  pageSize,
  pageSizeOptions,
  totalItems,
  itemLabel = "records",
  onPageChange,
  onPageSizeChange,
}: CollectionPaginationBarProps) {
  return (
    <AppPaginationBar
      disabled={disabled}
      loading={loading}
      page={page}
      totalPages={totalPages}
      pageSize={pageSize}
      pageSizeOptions={pageSizeOptions}
      totalItems={totalItems}
      itemLabel={itemLabel}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
}
