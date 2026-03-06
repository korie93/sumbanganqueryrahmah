import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { getCollectionMonthlySummary, type CollectionMonthlySummary } from "@/lib/api";
import { formatAmountRM, parseApiError } from "./utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function buildEmptySummary(): CollectionMonthlySummary[] {
  return MONTH_NAMES.map((monthName, index) => ({
    month: index + 1,
    monthName,
    totalRecords: 0,
    totalAmount: 0,
  }));
}

function normalizeSummaryRows(rows: CollectionMonthlySummary[] | undefined): CollectionMonthlySummary[] {
  if (!Array.isArray(rows) || rows.length === 0) return buildEmptySummary();

  const byMonth = new Map<number, CollectionMonthlySummary>();
  for (const row of rows) {
    const month = Number(row?.month || 0);
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    byMonth.set(month, {
      month,
      monthName: String(row.monthName || MONTH_NAMES[month - 1]),
      totalRecords: Number(row.totalRecords || 0),
      totalAmount: Number(row.totalAmount || 0),
    });
  }

  return MONTH_NAMES.map((monthName, index) => {
    const month = index + 1;
    const found = byMonth.get(month);
    if (found) return found;
    return {
      month,
      monthName,
      totalRecords: 0,
      totalAmount: 0,
    };
  });
}

export default function CollectionSummaryPage() {
  const { toast } = useToast();
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let year = currentYear + 1; year >= currentYear - 5; year -= 1) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [staffInput, setStaffInput] = useState("");
  const [appliedStaff, setAppliedStaff] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryRows, setSummaryRows] = useState<CollectionMonthlySummary[]>(() => buildEmptySummary());

  const loadSummary = useCallback(async (year: number, staff?: string) => {
    setLoading(true);
    try {
      const response = await getCollectionMonthlySummary({ year, staff });
      setSummaryRows(normalizeSummaryRows(response?.summary));
    } catch (error: unknown) {
      setSummaryRows(buildEmptySummary());
      toast({
        title: "Failed to Load Summary",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const year = Number(selectedYear);
    if (!Number.isInteger(year)) return;
    void loadSummary(year, appliedStaff || undefined);
  }, [appliedStaff, selectedYear, loadSummary]);

  const grandTotal = useMemo(() => {
    return summaryRows.reduce(
      (acc, row) => {
        acc.totalRecords += Number(row.totalRecords) || 0;
        acc.totalAmount += Number(row.totalAmount) || 0;
        return acc;
      },
      { totalRecords: 0, totalAmount: 0 },
    );
  }, [summaryRows]);

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Collection Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto_auto]">
          <div className="space-y-1">
            <Label>Year</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Staff Nickname (optional)</Label>
            <Input
              value={staffInput}
              onChange={(event) => setStaffInput(event.target.value)}
              placeholder="Contoh: Sathia"
              maxLength={64}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => setAppliedStaff(staffInput.trim())}
              disabled={loading}
            >
              Filter
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setStaffInput("");
                setAppliedStaff("");
              }}
              disabled={loading}
            >
              Reset
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border/60 overflow-hidden">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Total Records</TableHead>
                <TableHead>Total Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                    Loading summary...
                  </TableCell>
                </TableRow>
              ) : (
                summaryRows.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.monthName}</TableCell>
                    <TableCell>{row.totalRecords}</TableCell>
                    <TableCell>{formatAmountRM(row.totalAmount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-border/60 bg-background/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Grand Total Records</p>
              <p className="text-xl font-semibold">{grandTotal.totalRecords}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Grand Total Amount</p>
              <p className="text-xl font-semibold">{formatAmountRM(grandTotal.totalAmount)}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
