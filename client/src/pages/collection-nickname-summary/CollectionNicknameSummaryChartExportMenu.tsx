import { Download, FileImage, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CollectionNicknameSummaryExportKind = "csv" | "png" | "pdf";

type CollectionNicknameSummaryChartExportMenuProps = {
  busyKind: CollectionNicknameSummaryExportKind | null;
  disabled: boolean;
  targetLoading?: boolean;
  visibleCount: number;
  onExport: (kind: CollectionNicknameSummaryExportKind) => void;
};

const EXPORT_OPTIONS = [
  { kind: "csv", label: "Eksport CSV", description: "Data ranking penuh", icon: FileSpreadsheet },
  { kind: "png", label: "Eksport PNG", description: "Imej chart dan ranking", icon: FileImage },
  { kind: "pdf", label: "Eksport PDF", description: "Laporan berhalaman", icon: FileText },
] as const;

export function CollectionNicknameSummaryChartExportMenu({
  busyKind,
  disabled,
  targetLoading = false,
  visibleCount,
  onExport,
}: CollectionNicknameSummaryChartExportMenuProps) {
  const exporting = busyKind !== null;
  const disabledForExport = disabled || exporting || targetLoading;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={disabledForExport}
          aria-label="Eksport nickname summary chart"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : targetLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {exporting ? `Menjana ${busyKind?.toUpperCase()}` : targetLoading ? "Memuat target" : "Eksport"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block text-sm">Eksport paparan semasa</span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {targetLoading
              ? "Target Collection Daily sedang dimuat sebelum eksport."
              : `${visibleCount} nickname akan disertakan.`}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EXPORT_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.kind}
              className="items-start gap-3 py-2.5"
              disabled={exporting || targetLoading}
              onSelect={() => onExport(option.kind)}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
