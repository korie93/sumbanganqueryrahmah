import { memo } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewerPageHeaderProps {
  importName: string;
  totalRows: number;
  headersCount: number;
  loading: boolean;
  onBack: () => void;
}

function ViewerPageHeaderImpl({
  importName,
  totalRows,
  headersCount,
  loading,
  onBack,
}: ViewerPageHeaderProps) {
  return (
    <header className="viewer-page-header">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        data-testid="button-back"
        className="viewer-back-link"
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Saved
      </Button>
      <h1 id="viewer-dataset-title" className="viewer-page-title" title={importName}>
        {importName}
      </h1>
      <p className="viewer-page-context">
        {loading ? "Memuatkan rekod…" : `${totalRows.toLocaleString("en-MY")} rekod`}
        {headersCount > 0 ? ` · ${headersCount} lajur` : ""}
      </p>
    </header>
  );
}

export const ViewerPageHeader = memo(ViewerPageHeaderImpl);
