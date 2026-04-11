import { Copy, type LucideIcon } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AnalysisCategory } from "@/pages/analysis/types";

interface AnalysisCategoryCardProps {
  category: AnalysisCategory;
  colorClass: string;
  icon: LucideIcon;
  onCopySample: (sample: string) => void;
  title: string;
}

export function AnalysisCategoryCard({
  category,
  colorClass,
  icon: Icon,
  onCopySample,
  title,
}: AnalysisCategoryCardProps) {
  const testIdTitle = title.toLowerCase().replace(/\s/g, "-");

  return (
    <Card className="glass-wrapper border-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{category.count.toLocaleString()}</div>
        {category.samples.length > 0 ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-muted-foreground">Examples:</p>
            <div className="flex flex-wrap gap-1">
              {category.samples.slice(0, 5).map((sample, index) => (
                <button
                  key={`${title}:${sample}`}
                  type="button"
                  className={cn(
                    badgeVariants({ variant: "secondary" }),
                    "cursor-pointer text-xs",
                  )}
                  onClick={() => onCopySample(sample)}
                  aria-label={`Copy sample value ${sample}`}
                  title={`Copy ${sample}`}
                  data-testid={`badge-sample-${testIdTitle}-${index}`}
                >
                  {sample}
                  <Copy className="w-3 h-3 ml-1 opacity-50" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
