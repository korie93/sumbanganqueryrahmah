import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TABLE_PAGE_SIZE } from "@/pages/analysis/utils";

interface AnalysisExpandableSectionProps {
  copiedItems: Record<string, boolean>;
  isExpanded: boolean;
  items: string[];
  onCopyAll: (items: string[], sectionKey: string) => void;
  onCopyItem: (text: string, itemKey?: string) => void;
  onPageChange: (sectionKey: string, page: number, totalItems: number) => void;
  onToggle: () => void;
  page: number;
  pagedItems: string[];
  sectionKey: string;
  start: number;
  title: string;
  totalPages: number;
  colorClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function AnalysisExpandableSection({
  copiedItems,
  isExpanded,
  items,
  onCopyAll,
  onCopyItem,
  onPageChange,
  onToggle,
  page,
  pagedItems,
  sectionKey,
  start,
  title,
  totalPages,
  colorClass,
  icon: Icon,
}: AnalysisExpandableSectionProps) {
  if (items.length === 0) return null;

  const end = Math.min(start + pagedItems.length, items.length);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle} className="glass-wrapper">
      <CollapsibleTrigger className="w-full" data-testid={`trigger-expand-${sectionKey}`}>
        <div className="flex items-center justify-between gap-2 p-4">
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${colorClass}`} />
            <span className="font-medium text-foreground">{title}</span>
            <Badge variant="secondary">{items.length.toLocaleString()}</Badge>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border">
          <div className="p-3 bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Full list ({items.length} items)</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopyAll(items, sectionKey)}
              data-testid={`button-copy-all-${sectionKey}`}
            >
              {copiedItems[`all-${sectionKey}`] ? (
                <Check className="w-4 h-4 mr-2 text-green-500" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              Copy All
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <div className="grid grid-cols-[64px_1fr_96px] bg-muted text-sm">
              <div className="p-3 font-medium text-muted-foreground">#</div>
              <div className="p-3 font-medium text-muted-foreground">Value</div>
              <div className="p-3 text-right font-medium text-muted-foreground">Copy</div>
            </div>
            <div>
              {pagedItems.map((item, index) => {
                const rowIndex = start + index;
                const itemKey = `${sectionKey}-${rowIndex}`;
                return (
                  <div
                    key={itemKey}
                    className="grid grid-cols-[64px_1fr_96px] items-center border-t border-border text-sm hover:bg-muted/50"
                  >
                    <div className="px-3 py-2 text-muted-foreground">{rowIndex + 1}</div>
                    <div className="truncate px-3 py-2 font-mono text-foreground">{item}</div>
                    <div className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopyItem(item, itemKey)}
                        data-testid={`button-copy-${sectionKey}-${index}`}
                      >
                        {copiedItems[itemKey] ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {items.length > TABLE_PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 p-3">
              <span className="text-xs text-muted-foreground">
                Showing {start + 1}-{end} of {items.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(sectionKey, page - 1, items.length)}
                  disabled={page <= 0}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(sectionKey, page + 1, items.length)}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
