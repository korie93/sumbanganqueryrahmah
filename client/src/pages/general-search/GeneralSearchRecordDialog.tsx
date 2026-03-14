import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SearchResultRow } from "@/pages/general-search/types";
import { getCellDisplayText } from "@/pages/general-search/utils";

interface GeneralSearchRecordDialogProps {
  canSeeSourceFile: boolean;
  onOpenChange: (open: boolean) => void;
  record: SearchResultRow | null;
}

export function GeneralSearchRecordDialog({
  canSeeSourceFile,
  onOpenChange,
  record,
}: GeneralSearchRecordDialogProps) {
  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Details</DialogTitle>
        </DialogHeader>
        {record ? (
          <Card className="border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm tracking-widest text-muted-foreground">INFORMATION</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Object.keys(record).map((key) => {
                  if (key.startsWith("_") || key === "__rowId") return null;
                  if (!canSeeSourceFile && key === "Source File") return null;

                  const isImportant = /name|ic|id|passport|no\.?|nric|kad|pengenalan/i.test(key);

                  return (
                    <div key={key} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">{key}</div>
                      <div className={`mt-1 text-sm ${isImportant ? "font-semibold text-foreground" : "text-foreground"}`}>
                        {getCellDisplayText(record[key])}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
