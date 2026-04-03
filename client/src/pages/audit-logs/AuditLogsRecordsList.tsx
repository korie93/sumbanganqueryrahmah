import { ChevronDown, Clock, FileText, Info, RefreshCw, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import {
  formatAuditTime,
  getAuditActionInfo,
  getAuditDetailsPreview,
  shouldCollapseAuditDetails,
} from "@/pages/audit-logs/utils";

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

  return (
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
                {filteredLogs.map((log) => {
                  const actionInfo = getAuditActionInfo(log.action);
                  const details = log.details ?? "";
                  const collapseDetails = Boolean(details) && isMobile && shouldCollapseAuditDetails(details);

                  return (
                    <div
                      key={log.id}
                      className={`space-y-3 border border-border/70 bg-card/70 shadow-xs ${
                        isMobile ? "rounded-2xl p-3.5" : "rounded-xl p-4"
                      }`}
                      data-testid={`audit-log-${log.id}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <Badge
                            variant={actionInfo.variant}
                            className="max-w-full whitespace-normal break-words py-1 text-left leading-4 sm:whitespace-nowrap"
                          >
                            {actionInfo.label}
                          </Badge>
                          <p
                            className="break-all font-mono text-[11px] text-muted-foreground/80"
                            data-testid={`text-action-code-${log.id}`}
                          >
                            {actionInfo.rawAction}
                          </p>
                        </div>

                        <div className={`rounded-lg border border-border/60 bg-muted/35 px-3 py-2 text-xs text-muted-foreground ${isMobile ? "" : "sm:min-w-[180px]"}`}>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-medium text-foreground/85">Recorded</span>
                          </div>
                          <p className="mt-1 break-words leading-relaxed" data-testid={`text-timestamp-${log.id}`}>
                            {formatAuditTime(log.timestamp)}
                          </p>
                        </div>
                      </div>

                      {isMobile ? (
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate" data-testid={`text-performed-by-${log.id}`}>{log.performedBy}</span>
                          </span>
                          {log.targetUser ? (
                            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate" data-testid={`text-target-user-${log.id}`}>{log.targetUser}</span>
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Actor
                            </p>
                            <div className="mt-2 flex items-start gap-2">
                              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <p className="min-w-0 break-words text-sm font-medium" data-testid={`text-performed-by-${log.id}`}>
                                {log.performedBy}
                              </p>
                            </div>
                          </div>

                          {log.targetUser ? (
                            <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Target User
                              </p>
                              <div className="mt-2 flex items-start gap-2">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                <p className="min-w-0 break-words text-sm font-medium" data-testid={`text-target-user-${log.id}`}>
                                  {log.targetUser}
                                </p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {log.targetResource ? (
                        isMobile ? (
                          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Resource ID
                            </p>
                            <p
                              className="mt-1.5 break-all font-mono text-xs text-foreground/85"
                              data-testid={`text-target-resource-${log.id}`}
                            >
                              {log.targetResource}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Resource ID
                            </p>
                            <p
                              className="mt-2 break-all font-mono text-xs text-foreground/85"
                              data-testid={`text-target-resource-${log.id}`}
                            >
                              {log.targetResource}
                            </p>
                          </div>
                        )
                      ) : null}

                      {details ? (
                        <div className={`bg-muted/35 ${isMobile ? "rounded-xl p-3" : "rounded-lg p-3"}`}>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Details
                          </p>
                          {collapseDetails ? (
                            <details className="mt-2 rounded-md border border-border/60 bg-background/70 p-3">
                              <summary
                                className="cursor-pointer list-none text-left [&::-webkit-details-marker]:hidden"
                                data-testid={`button-details-toggle-${log.id}`}
                              >
                                <p className="break-words text-sm leading-relaxed text-muted-foreground">
                                  {getAuditDetailsPreview(details)}
                                </p>
                                <span className="mt-2 inline-flex text-xs font-medium text-primary">
                                  Show full details
                                </span>
                              </summary>
                              <pre
                                className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
                                data-testid={`text-details-${log.id}`}
                              >
                                {details}
                              </pre>
                            </details>
                          ) : (
                            <p
                              className="mt-2 break-words text-sm leading-relaxed text-muted-foreground"
                              data-testid={`text-details-${log.id}`}
                            >
                              {details}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
