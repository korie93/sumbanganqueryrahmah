import { ChevronDown, Clock, FileText, Info, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import { formatAuditTime, getAuditActionBadge } from "@/pages/audit-logs/utils";

interface AuditLogsRecordsListProps {
  filteredLogs: AuditLogRecord[];
  loading: boolean;
  logs: AuditLogRecord[];
  onClearFilters: () => void;
  onRecordsOpenChange: (open: boolean) => void;
  recordsOpen: boolean;
}

export function AuditLogsRecordsList({
  filteredLogs,
  loading,
  logs,
  onClearFilters,
  onRecordsOpenChange,
  recordsOpen,
}: AuditLogsRecordsListProps) {
  return (
    <Collapsible open={recordsOpen} onOpenChange={onRecordsOpenChange}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between gap-2 p-0 h-auto"
              data-testid="button-toggle-records"
            >
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5" />
                Activity Records ({filteredLogs.length} of {logs.length} entries)
              </CardTitle>
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
                {logs.length === 0 ? (
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
              <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-lg border bg-muted/30 space-y-2"
                    data-testid={`audit-log-${log.id}`}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        {getAuditActionBadge(log.action)}
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span data-testid={`text-performed-by-${log.id}`}>{log.performedBy}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span data-testid={`text-timestamp-${log.id}`}>{formatAuditTime(log.timestamp)}</span>
                      </div>
                    </div>

                    <div className="text-sm space-y-1">
                      {log.targetUser ? (
                        <p>
                          <span className="text-muted-foreground">Target user:</span>{" "}
                          <span className="font-medium" data-testid={`text-target-user-${log.id}`}>
                            {log.targetUser}
                          </span>
                        </p>
                      ) : null}
                      {log.targetResource ? (
                        <p>
                          <span className="text-muted-foreground">Resource ID:</span>{" "}
                          <span className="font-mono text-xs" data-testid={`text-target-resource-${log.id}`}>
                            {log.targetResource}
                          </span>
                        </p>
                      ) : null}
                      {log.details ? (
                        <p className="text-muted-foreground" data-testid={`text-details-${log.id}`}>
                          {log.details}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
