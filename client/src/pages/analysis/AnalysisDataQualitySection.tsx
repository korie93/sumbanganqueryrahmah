import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Search,
} from "lucide-react";
import {
  OperationalMetric,
  OperationalSectionCard,
  OperationalSummaryStrip,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ANALYSIS_QUALITY_PAGE_SIZE,
  filterAnalysisColumnProfiles,
  formatAnalysisUniqueCount,
  getAnalysisColumnIssueCount,
  getAnalysisColumnTypeLabel,
  getAnalysisQualityLabel,
} from "@/pages/analysis/analysis-quality-utils";
import type {
  AnalysisData,
  AnalysisMode,
} from "@/pages/analysis/types";

type AnalysisDataQualitySectionProps = {
  analysis: AnalysisData;
  mode: AnalysisMode;
  onInspectColumn: (column: string) => void;
};

function getQualityTone(
  score: number,
  grade: AnalysisData["quality"]["grade"],
) {
  if (grade === "no_data") return "text-muted-foreground";
  if (score >= 95) return "text-emerald-700 dark:text-emerald-300";
  if (score >= 85) return "text-sky-700 dark:text-sky-300";
  if (score >= 70) return "text-amber-800 dark:text-amber-200";
  return "text-rose-700 dark:text-rose-300";
}

export function AnalysisDataQualitySection({
  analysis,
  mode,
  onInspectColumn,
}: AnalysisDataQualitySectionProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filteredProfiles = useMemo(
    () => filterAnalysisColumnProfiles(analysis.columns, query),
    [analysis.columns, query],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredProfiles.length / ANALYSIS_QUALITY_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * ANALYSIS_QUALITY_PAGE_SIZE;
  const end = Math.min(start + ANALYSIS_QUALITY_PAGE_SIZE, filteredProfiles.length);
  const visibleProfiles = filteredProfiles.slice(start, end);
  const quality = analysis.quality;
  const qualityLabel = getAnalysisQualityLabel(quality.grade);

  return (
    <OperationalSectionCard
      title="Data Quality"
      description="Column completeness contributes 70% of the score and type consistency contributes 30%."
      badge={
        <Badge
          variant="outline"
          className={getQualityTone(quality.score, quality.grade)}
          aria-label={`Data quality score ${quality.score} percent, ${qualityLabel}`}
        >
          {quality.score}% - {qualityLabel}
        </Badge>
      }
      contentClassName="space-y-5"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">Overall quality score</span>
          <span className={getQualityTone(quality.score, quality.grade)}>
            {quality.score}%
          </span>
        </div>
        <Progress
          value={quality.score}
          className="h-2"
          aria-label="Overall data quality score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={quality.score}
          aria-valuetext={`${quality.score}% ${qualityLabel}`}
        />
      </div>

      <OperationalSummaryStrip className="grid gap-3 md:grid-cols-3">
        <OperationalMetric
          label="Completeness"
          value={`${quality.completenessPercent}%`}
          supporting={`${quality.emptyCells.toLocaleString()} empty applicable cells`}
          tone={quality.completenessPercent >= 95 ? "success" : "warning"}
        />
        <OperationalMetric
          label="Type Consistency"
          value={`${quality.typeConsistencyPercent}%`}
          supporting={`${quality.mixedTypeColumns.toLocaleString()} mixed-type columns`}
          tone={quality.typeConsistencyPercent >= 95 ? "success" : "warning"}
        />
        <OperationalMetric
          label="Needs Review"
          value={quality.columnsNeedingReview.toLocaleString()}
          supporting={`${quality.columnsWithMissingValues.toLocaleString()} missing-value / ${quality.mixedTypeColumns.toLocaleString()} mixed`}
          tone={quality.columnsNeedingReview === 0 ? "success" : "warning"}
        />
      </OperationalSummaryStrip>

      {quality.columnLimitReached ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Column profiling reached its bounded safety limit. The score covers the first{" "}
            {quality.profiledColumns.toLocaleString()} columns.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Column Profiles</h3>
          <p className="text-sm text-muted-foreground">
            Review missing values, mixed types, and bounded unique-value estimates.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search column or type"
            aria-label="Search column profiles"
            className="pl-9"
          />
        </div>
      </div>

      {visibleProfiles.length === 0 ? (
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center">
          <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No matching columns</p>
          <p className="text-sm text-muted-foreground">Try a different column name or type.</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {visibleProfiles.map((profile) => {
            const issueCount = getAnalysisColumnIssueCount(profile);
            return (
              <article
                key={profile.name}
                className="grid gap-3 bg-background p-4 lg:grid-cols-[minmax(180px,1.4fr)_minmax(220px,1fr)_110px_110px_auto] lg:items-center"
                data-testid={`analysis-column-profile-${profile.name}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate font-medium text-foreground" title={profile.name}>
                      {profile.name}
                    </h4>
                    <Badge variant="secondary">
                      {getAnalysisColumnTypeLabel(profile.inferredType)}
                    </Badge>
                    {issueCount > 0 ? (
                      <Badge variant="outline" className="text-amber-800 dark:text-amber-200">
                        {issueCount} {issueCount === 1 ? "signal" : "signals"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {profile.populatedCount.toLocaleString()} populated -{" "}
                    {profile.emptyCount.toLocaleString()} empty
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>Completeness</span>
                    <span>{profile.completenessPercent}%</span>
                  </div>
                  <Progress
                    value={profile.completenessPercent}
                    className="h-1.5"
                    aria-label={`${profile.name} completeness`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={profile.completenessPercent}
                  />
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Consistency</p>
                  <p className="font-medium text-foreground">
                    {profile.typeConsistencyPercent}%
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Unique</p>
                  <p className="font-medium text-foreground">
                    {formatAnalysisUniqueCount(profile)}
                  </p>
                </div>

                {mode === "single" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onInspectColumn(profile.name)}
                    aria-label={`Inspect ${profile.name} in Viewer`}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Inspect
                  </Button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {filteredProfiles.length > ANALYSIS_QUALITY_PAGE_SIZE ? (
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {start + 1}-{end} of {filteredProfiles.length.toLocaleString()} columns
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(Math.max(0, safePage - 1))}
            >
              Prev
            </Button>
            <span>
              Page {safePage + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "all" ? (
        <p className="text-xs text-muted-foreground">
          Select Analyze on a single Saved file to inspect a specific column in Viewer.
        </p>
      ) : null}
    </OperationalSectionCard>
  );
}
