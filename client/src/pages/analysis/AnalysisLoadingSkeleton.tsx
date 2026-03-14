import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AnalysisLoadingSkeleton() {
  const pulseStyle = (delayMs: number) => ({
    animationDelay: `${delayMs}ms`,
    animationDuration: "1.4s",
  });

  return (
    <div className="space-y-6" data-testid="analysis-loading-skeleton">
      <Card className="glass-wrapper border-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-full motion-reduce:animate-none" style={pulseStyle(0)} />
              <Skeleton className="h-4 w-32 motion-reduce:animate-none" style={pulseStyle(80)} />
              <Skeleton className="h-6 w-20 motion-reduce:animate-none" style={pulseStyle(160)} />
            </div>
            <Skeleton className="h-6 w-40 motion-reduce:animate-none" style={pulseStyle(240)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-wrapper border-0">
          <CardHeader>
            <Skeleton className="h-6 w-56 motion-reduce:animate-none" style={pulseStyle(300)} />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full motion-reduce:animate-none" style={pulseStyle(360)} />
          </CardContent>
        </Card>
        <Card className="glass-wrapper border-0">
          <CardHeader>
            <Skeleton className="h-6 w-52 motion-reduce:animate-none" style={pulseStyle(420)} />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[250px] w-full motion-reduce:animate-none" style={pulseStyle(480)} />
          </CardContent>
        </Card>
      </div>

      <div>
        <Skeleton className="h-6 w-44 mb-4 motion-reduce:animate-none" style={pulseStyle(520)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={`analysis-skeleton-card-${index}`} className="glass-wrapper border-0">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24 motion-reduce:animate-none" style={pulseStyle(580 + index * 60)} />
                  <Skeleton className="h-4 w-4 rounded-full motion-reduce:animate-none" style={pulseStyle(620 + index * 60)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-24 motion-reduce:animate-none" style={pulseStyle(660 + index * 60)} />
                <Skeleton className="h-3 w-full motion-reduce:animate-none" style={pulseStyle(700 + index * 60)} />
                <Skeleton className="h-3 w-5/6 motion-reduce:animate-none" style={pulseStyle(740 + index * 60)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="glass-wrapper border-0">
        <CardContent className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-6 w-64 motion-reduce:animate-none" style={pulseStyle(820)} />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={`analysis-skeleton-row-${index}`}
                className="h-12 w-full motion-reduce:animate-none"
                style={pulseStyle(860 + index * 80)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
