import type { CSSProperties } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ANALYSIS_SUMMARY_CARD_SKELETONS = [
  { key: "files-card", delayOffset: 0 },
  { key: "amounts-card", delayOffset: 60 },
  { key: "duplicates-card", delayOffset: 120 },
  { key: "errors-card", delayOffset: 180 },
  { key: "warnings-card", delayOffset: 240 },
  { key: "ready-card", delayOffset: 300 },
] as const;

const ANALYSIS_TABLE_ROW_SKELETONS = [
  { key: "first-row", delayOffset: 0 },
  { key: "second-row", delayOffset: 80 },
  { key: "third-row", delayOffset: 160 },
  { key: "fourth-row", delayOffset: 240 },
] as const;

export function AnalysisLoadingSkeleton() {
  const pulseProps = (delayMs: number) => ({
    style: { "--pulse-delay": `${delayMs}ms` } as CSSProperties,
  });

  return (
    <div className="space-y-6" data-testid="analysis-loading-skeleton">
      <Card className="glass-wrapper border-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Skeleton className="analysis-skeleton-pulse h-5 w-5 rounded-full motion-reduce:animate-none" {...pulseProps(0)} />
              <Skeleton className="analysis-skeleton-pulse h-4 w-32 motion-reduce:animate-none" {...pulseProps(80)} />
              <Skeleton className="analysis-skeleton-pulse h-6 w-20 motion-reduce:animate-none" {...pulseProps(160)} />
            </div>
            <Skeleton className="analysis-skeleton-pulse h-6 w-40 motion-reduce:animate-none" {...pulseProps(240)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-wrapper border-0">
          <CardHeader>
            <Skeleton className="analysis-skeleton-pulse h-6 w-56 motion-reduce:animate-none" {...pulseProps(300)} />
          </CardHeader>
          <CardContent>
            <Skeleton className="analysis-skeleton-pulse h-[250px] w-full motion-reduce:animate-none" {...pulseProps(360)} />
          </CardContent>
        </Card>
        <Card className="glass-wrapper border-0">
          <CardHeader>
            <Skeleton className="analysis-skeleton-pulse h-6 w-52 motion-reduce:animate-none" {...pulseProps(420)} />
          </CardHeader>
          <CardContent>
            <Skeleton className="analysis-skeleton-pulse h-[250px] w-full motion-reduce:animate-none" {...pulseProps(480)} />
          </CardContent>
        </Card>
      </div>

      <div>
        <Skeleton className="analysis-skeleton-pulse h-6 w-44 mb-4 motion-reduce:animate-none" {...pulseProps(520)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ANALYSIS_SUMMARY_CARD_SKELETONS.map((skeleton) => (
            <Card key={skeleton.key} className="glass-wrapper border-0">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="analysis-skeleton-pulse h-4 w-24 motion-reduce:animate-none" {...pulseProps(580 + skeleton.delayOffset)} />
                  <Skeleton className="analysis-skeleton-pulse h-4 w-4 rounded-full motion-reduce:animate-none" {...pulseProps(620 + skeleton.delayOffset)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="analysis-skeleton-pulse h-8 w-24 motion-reduce:animate-none" {...pulseProps(660 + skeleton.delayOffset)} />
                <Skeleton className="analysis-skeleton-pulse h-3 w-full motion-reduce:animate-none" {...pulseProps(700 + skeleton.delayOffset)} />
                <Skeleton className="analysis-skeleton-pulse h-3 w-5/6 motion-reduce:animate-none" {...pulseProps(740 + skeleton.delayOffset)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="glass-wrapper border-0">
        <CardContent className="p-4">
          <div className="space-y-3">
            <Skeleton className="analysis-skeleton-pulse h-6 w-64 motion-reduce:animate-none" {...pulseProps(820)} />
            {ANALYSIS_TABLE_ROW_SKELETONS.map((skeleton) => (
              <Skeleton
                key={skeleton.key}
                className="analysis-skeleton-pulse h-12 w-full motion-reduce:animate-none"
                {...pulseProps(860 + skeleton.delayOffset)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
