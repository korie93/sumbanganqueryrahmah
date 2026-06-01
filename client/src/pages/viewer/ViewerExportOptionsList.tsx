import { memo, useCallback } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type ViewerExportActionKind,
  type ViewerExportMenuSection,
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
}: ViewerExportOptionButtonProps) {
  const Icon = resolveViewerExportIcon(option.kind);
  const handleRunExport = useCallback(() => {
    onRunExport(option.kind, option.exportFiltered, option.exportSelected);
  }, [onRunExport, option.exportFiltered, option.exportSelected, option.kind]);

  return (
    <Button
      variant="ghost"
      className="w-full justify-start"
      onClick={handleRunExport}
      disabled={option.disabled}
      data-testid={`button-export-${option.id}`}
    >
      <Icon className="mr-2 h-4 w-4" />
      {option.label}
    </Button>
  );
});

function ViewerExportOptionsListImpl({
  headersCount,
  sections,
  selectedColumnsCount,
  onRunExport,
}: ViewerExportOptionsListProps) {
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
            />
          ))}
        </div>
      ))}
      <div className="mt-2 border-t pt-2">
        <p className="px-2 text-xs text-muted-foreground">
          Columns: {selectedColumnsCount} of {headersCount}
        </p>
      </div>
    </div>
  );
}

export const ViewerExportOptionsList = memo(ViewerExportOptionsListImpl);
