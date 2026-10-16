import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateDDMMYYYY } from "@/lib/date-format";

type Props = {
  previousDate: string | null;
  nextDate: string | null;
  loading: boolean;
  onChangeDate: (date: string) => void;
};

export function CollectionDailyDateNavigation({ previousDate, nextDate, loading, onChangeDate }: Props) {
  return (
    <nav aria-label="Tukar tarikh kutipan dalam bulan ini" className="flex min-w-0 items-center gap-2" data-floating-ai-avoid="true">
      <Button
        type="button" variant="outline" className="h-11 w-11 shrink-0 p-0"
        aria-label="Tarikh sebelumnya"
        title={previousDate ? formatDateDDMMYYYY(previousDate) : "Awal bulan"}
        disabled={!previousDate || loading}
        onClick={() => { if (previousDate && !loading) onChangeDate(previousDate); }}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className="min-w-0 text-xs text-muted-foreground">Tarikh dalam bulan ini</span>
      <Button
        type="button" variant="outline" className="h-11 w-11 shrink-0 p-0"
        aria-label="Tarikh seterusnya"
        title={nextDate ? formatDateDDMMYYYY(nextDate) : "Akhir bulan"}
        disabled={!nextDate || loading}
        onClick={() => { if (nextDate && !loading) onChangeDate(nextDate); }}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}
