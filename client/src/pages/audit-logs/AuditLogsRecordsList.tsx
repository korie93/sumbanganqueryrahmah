import { useCallback, useState } from "react";
import { ChevronDown, FileText, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { AuditLogDetailSheet } from "@/pages/audit-logs/AuditLogDetailSheet";
import { AuditLogRecordCard } from "@/pages/audit-logs/AuditLogRecordCard";
import type { AuditLogRecord } from "@/pages/audit-logs/types";

interface AuditLogsRecordsListProps {
  filteredLogs: AuditLogRecord[];
  loading: boolean;
  totalLogs: number;
  onClearFilters: () => void;
  onRecordsOpenChange: (open: boolean) => void;
  recordsOpen: boolean;
}

export function AuditLogsRecordsList({
  filteredLogs,
  loading,
  totalLogs,
  onClearFilters,
  onRecordsOpenChange,
  recordsOpen,
}: AuditLogsRecordsListProps) {
  const isMobile = useIsMobile();
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);
  const handleDetailOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedLog(null);
    }
  }, []);

  return (
    <>
      <Collapsible open={recordsOpen} onOpenChange={onRecordsOpenChange}>
        <Card data-floating-ai-avoid="true">
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-between gap-3 rounded-xl px-0 py-0 text-left"
                data-testid="button-toggle-records"
              >
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Info className="h-5 w-5 shrink-0" />
                    <span>Activity Records</span>
                  </CardTitle>
                  <p className="text-left text-sm text-muted-foreground">
                    {isMobile
                      ? `${filteredLogs.length} of ${totalLogs} entries`
                      : `Showing ${filteredLogs.length} of ${totalLogs} audit entries`}
                  </p>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${recordsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {totalLogs === 0 ? (
                    <p>No audit records found.</p>
                  ) : (
                    <>
                      <p>No records match the filters.</p>
                      <Button
                        variant="ghost"
                        onClick={onClearFilters}
                        className="mt-2"
                        data-testid="button-clear-filters-empty"
                      >
                        Clear all filters
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="max-h-[min(70vh,38rem)] space-y-3 overflow-y-auto pr-1 sm:pr-2">
                  {filteredLogs.map((log) => (
                    <AuditLogRecordCard
                      key={log.id}
                      isMobile={isMobile}
                      log={log}
                      onViewDetails={setSelectedLog}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      <AuditLogDetailSheet log={selectedLog} onOpenChange={handleDetailOpenChange} />
    </>
  );
}
