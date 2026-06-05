import { Suspense, lazy } from "react";
import { BarChart3 } from "lucide-react";
import { LazyDialogFallback } from "@/components/LazySuspenseFallback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CollectionSummaryBarChartDialogContentProps } from "@/pages/collection-summary/CollectionSummaryBarChartDialogContent";

const CollectionSummaryBarChartDialogContent = lazy(() =>
  import("@/pages/collection-summary/CollectionSummaryBarChartDialogContent").then((module) => ({
    default: module.CollectionSummaryBarChartDialogContent,
  })),
);

export type CollectionSummaryBarChartDialogProps = CollectionSummaryBarChartDialogContentProps;

export function CollectionSummaryBarChartDialog(props: CollectionSummaryBarChartDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 rounded-full px-3"
          aria-label="Lihat graf bar ringkasan kutipan"
          aria-haspopup="dialog"
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          <span>Graf bar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl gap-4 p-4 sm:p-5">
        <DialogHeader className="pr-8">
          <DialogTitle>Graf bar ringkasan kutipan</DialogTitle>
          <DialogDescription>
            Carta ini menggunakan data tahun, nickname, loading state, dan jumlah yang sama dengan Collection Summary semasa.
          </DialogDescription>
        </DialogHeader>
        <Suspense fallback={<LazyDialogFallback label="Loading collection summary chart..." />}>
          <CollectionSummaryBarChartDialogContent {...props} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
