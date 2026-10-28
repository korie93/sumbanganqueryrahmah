import { memo, useCallback, useId } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type ViewerExportActionKind,
  type ViewerExportMenuSection,
  VIEWER_EXPORT_PAGE_HINT,
} from "@/pages/viewer/export-menu-utils";

interface ViewerExportOptionsListProps {
  headersCount: number;
  sections: ViewerExportMenuSection[];
  selectedColumnsCount: number;
  onRunExport: (
    kind: ViewerExportActionKind,
    exportFiltered: boolean,
    exportSelected: boolean,
  ) => void;
}

interface ViewerExportOptionButtonProps {
  option: ViewerExportMenuSection["options"][number];
  onRunExport: ViewerExportOptionsListProps["onRunExport"];
  descriptionId: string;
}

function resolveViewerExportIcon(kind: ViewerExportActionKind) {
  if (kind === "pdf") {
    return FileText;
  }

  return Download;
}

const ViewerExportOptionButton = memo(function ViewerExportOptionButton({
  option,
  onRunExport,
  descriptionId,
}: ViewerExportOptionButtonProps) {
  const Icon = resolveViewerExportIcon(option.kind);
  const handleRunExport = useCallback(() => {
    onRunExport(option.kind, option.exportFiltered, option.exportSelected);
  }, [onRunExport, option.exportFiltered, option.exportSelected, option.kind]);

  return (
    <Button
      variant="ghost"
      className="h-auto min-h-11 w-full items-start justify-start whitespace-normal py-2 text-left leading-snug"
      onClick={handleRunExport}
      disabled={option.disabled}
      data-testid={`button-export-${option.id}`}
      aria-describedby={option.exportFiltered && !option.exportSelected ? descriptionId : undefined}
    >
      <Icon className="mr-2 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{option.label}</span>
    </Button>
  );
});

function ViewerExportOptionsListImpl({
  headersCount,
  sections,
  selectedColumnsCount,
  onRunExport,
}: ViewerExportOptionsListProps) {
  const descriptionId = useId();
  const hasPageOption = sections.some((section) => section.options.some((option) => option.exportFiltered && !option.exportSelected));
  return (
    <div className="space-y-1">
      {sections.map((section, sectionIndex) => (
        <div key={section.id}>
          {sectionIndex > 0 ? <div className="my-2 border-t" /> : null}
          <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{section.title}</p>
          {section.options.map((option) => (
            <ViewerExportOptionButton
              key={option.id}
              option={option}
              onRunExport={onRunExport}
              descriptionId={descriptionId}
            />
          ))}
        </div>
      ))}
      {hasPageOption ? <p id={descriptionId} className="px-2 pt-2 text-xs leading-relaxed text-muted-foreground">{VIEWER_EXPORT_PAGE_HINT}</p> : null}
      <div className="mt-2 border-t pt-2">
        <p className="px-2 text-xs text-muted-foreground">
          Columns: {selectedColumnsCount} of {headersCount}
        </p>
      </div>
    </div>
  );
}

export const ViewerExportOptionsList = memo(ViewerExportOptionsListImpl);
