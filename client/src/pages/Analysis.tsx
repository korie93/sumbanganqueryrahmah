import { useState, useEffect } from "react";
import { BarChart3, Users, Shield, Plane, AlertTriangle, RefreshCw, ArrowLeft, Copy, ChevronDown, ChevronUp, Check, RotateCcw, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { analyzeImport, analyzeAll } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface AnalysisProps {
  onNavigate: (page: string) => void;
}

interface AnalysisCategory {
  count: number;
  samples: string[];
}

interface DuplicateItem {
  value: string;
  count: number;
}

interface AnalysisData {
  icLelaki: AnalysisCategory;
  icPerempuan: AnalysisCategory;
  noPolis: AnalysisCategory;
  noTentera: AnalysisCategory;
  passportMY: AnalysisCategory;
  passportLuarNegara: AnalysisCategory;
  duplicates: { count: number; items: DuplicateItem[] };
}

interface SingleAnalysisResult {
  import: { id: string; name: string; filename: string };
  totalRows: number;
  analysis: AnalysisData;
}

interface AllAnalysisResult {
  totalImports: number;
  totalRows: number;
  imports: { id: string; name: string; filename: string; rowCount: number }[];
  analysis: AnalysisData;
}

type AnalysisMode = "single" | "all";

const CHART_COLORS = {
  blue: "#3b82f6",
  pink: "#ec4899",
  yellow: "#ca8a04",
  green: "#16a34a",
  purple: "#9333ea",
  orange: "#ea580c",
};

export default function Analysis({ onNavigate }: AnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("single");
  const [singleResult, setSingleResult] = useState<SingleAnalysisResult | null>(null);
  const [allResult, setAllResult] = useState<AllAnalysisResult | null>(null);
  const [importName, setImportName] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [duplicatesOpen, setDuplicatesOpen] = useState(true);
  const [filesListOpen, setFilesListOpen] = useState(true);
  const { toast } = useToast();

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const fetchSingleAnalysis = async () => {
    const importId = localStorage.getItem("analysisImportId");
    const name = localStorage.getItem("analysisImportName") || "Data";
    setImportName(name);

    if (!importId) {
      setMode("all");
      await fetchAllAnalysis();
      return;
    }

    setLoading(true);
    setError("");
    setMode("single");
    try {
      const data = await analyzeImport(importId);
      setSingleResult(data);
    } catch (err: any) {
      setError(err?.message || "Failed to analyze data.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAnalysis = async () => {
    setLoading(true);
    setError("");
    setMode("all");
    try {
      const data = await analyzeAll();
      if (data.totalImports === 0) {
        setError("No saved files to analyze. Please import a file first.");
      } else {
        setAllResult(data);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to analyze data.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem("analysisImportId");
    localStorage.removeItem("analysisImportName");
    fetchAllAnalysis();
  };

  useEffect(() => {
    fetchSingleAnalysis();
  }, []);

  const copyToClipboard = (text: string, itemKey?: string) => {
    navigator.clipboard.writeText(text);
    if (itemKey) {
      setCopiedItems((prev) => ({ ...prev, [itemKey]: true }));
      setTimeout(() => {
        setCopiedItems((prev) => ({ ...prev, [itemKey]: false }));
      }, 2000);
    }
    toast({
      title: "Copied",
      description: "Text has been copied to clipboard.",
    });
  };

  const copyAllToClipboard = (items: string[], sectionKey: string) => {
    navigator.clipboard.writeText(items.join("\n"));
    setCopiedItems((prev) => ({ ...prev, [`all-${sectionKey}`]: true }));
    setTimeout(() => {
      setCopiedItems((prev) => ({ ...prev, [`all-${sectionKey}`]: false }));
    }, 2000);
    toast({
      title: "Copied",
      description: `${items.length} items have been copied to clipboard.`,
    });
  };

  const getCurrentAnalysis = (): AnalysisData | null => {
    if (mode === "single" && singleResult) {
      return singleResult.analysis;
    }
    if (mode === "all" && allResult) {
      return allResult.analysis;
    }
    return null;
  };

  const getTotalRows = (): number => {
    if (mode === "single" && singleResult) {
      return singleResult.totalRows;
    }
    if (mode === "all" && allResult) {
      return allResult.totalRows;
    }
    return 0;
  };

  const getGenderPieData = () => {
    const analysis = getCurrentAnalysis();
    if (!analysis) return [];
    return [
      { name: "IC Male", value: analysis.icLelaki.count, color: CHART_COLORS.blue },
      { name: "IC Female", value: analysis.icPerempuan.count, color: CHART_COLORS.pink },
    ].filter((item) => item.value > 0);
  };

  const getCategoryBarData = () => {
    const analysis = getCurrentAnalysis();
    if (!analysis) return [];
    return [
      { name: "IC Male", count: analysis.icLelaki.count, fill: CHART_COLORS.blue },
      { name: "IC Female", count: analysis.icPerempuan.count, fill: CHART_COLORS.pink },
      { name: "Police No.", count: analysis.noPolis.count, fill: CHART_COLORS.yellow },
      { name: "Military No.", count: analysis.noTentera.count, fill: CHART_COLORS.green },
      { name: "Passport MY", count: analysis.passportMY.count, fill: CHART_COLORS.purple },
      { name: "Foreign Passport", count: analysis.passportLuarNegara.count, fill: CHART_COLORS.orange },
    ];
  };

  const renderExpandableSection = (
    key: string,
    title: string,
    icon: any,
    items: string[],
    colorClass: string
  ) => {
    if (items.length === 0) return null;
    const Icon = icon;
    const isExpanded = expandedSections[key] || false;

    return (
      <Collapsible open={isExpanded} onOpenChange={() => toggleSection(key)} className="glass-wrapper">
        <CollapsibleTrigger className="w-full" data-testid={`trigger-expand-${key}`}>
          <div className="flex items-center justify-between gap-2 p-4">
            <div className="flex items-center gap-3">
              <Icon className={`w-5 h-5 ${colorClass}`} />
              <span className="font-medium text-foreground">{title}</span>
              <Badge variant="secondary">{items.length.toLocaleString()}</Badge>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border">
            <div className="p-3 bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Full list ({items.length} items)</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyAllToClipboard(items, key)}
                data-testid={`button-copy-all-${key}`}
              >
                {copiedItems[`all-${key}`] ? (
                  <Check className="w-4 h-4 mr-2 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                Copy All
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground w-16">#</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Value</th>
                    <th className="text-right p-3 font-medium text-muted-foreground w-24">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const itemKey = `${key}-${idx}`;
                    return (
                      <tr key={idx} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-mono text-foreground">{item}</td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(item, itemKey)}
                            data-testid={`button-copy-${key}-${idx}`}
                          >
                            {copiedItems[itemKey] ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderCategoryCard = (
    title: string,
    icon: any,
    category: AnalysisCategory,
    colorClass: string
  ) => {
    const Icon = icon;
    return (
      <Card className="glass-wrapper border-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className={`w-4 h-4 ${colorClass}`} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{category.count.toLocaleString()}</div>
          {category.samples.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground">Examples:</p>
              <div className="flex flex-wrap gap-1">
                {category.samples.slice(0, 5).map((sample, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-xs cursor-pointer"
                    onClick={() => copyToClipboard(sample)}
                    data-testid={`badge-sample-${title.toLowerCase().replace(/\s/g, "-")}-${idx}`}
                  >
                    {sample}
                    <Copy className="w-3 h-3 ml-1 opacity-50" />
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderLoadingSkeleton = () => (
    // CSS-only stagger for smoother perceived loading on low-spec clients.
    // No JS timers/intervals are used.
    (() => {
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
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={`analysis-skeleton-card-${idx}`} className="glass-wrapper border-0">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24 motion-reduce:animate-none" style={pulseStyle(580 + idx * 60)} />
                  <Skeleton className="h-4 w-4 rounded-full motion-reduce:animate-none" style={pulseStyle(620 + idx * 60)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-24 motion-reduce:animate-none" style={pulseStyle(660 + idx * 60)} />
                <Skeleton className="h-3 w-full motion-reduce:animate-none" style={pulseStyle(700 + idx * 60)} />
                <Skeleton className="h-3 w-5/6 motion-reduce:animate-none" style={pulseStyle(740 + idx * 60)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="glass-wrapper border-0">
        <CardContent className="p-4">
          <div className="space-y-3">
            <Skeleton className="h-6 w-64 motion-reduce:animate-none" style={pulseStyle(820)} />
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton
                key={`analysis-skeleton-row-${idx}`}
                className="h-12 w-full motion-reduce:animate-none"
                style={pulseStyle(860 + idx * 80)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
      );
    })()
  );

  const analysis = getCurrentAnalysis();
  const totalRows = getTotalRows();
  const genderPieData = getGenderPieData();
  const categoryBarData = getCategoryBarData();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => onNavigate("saved")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-foreground">Data Analysis</h1>
                {mode === "all" && allResult && (
                  <Badge variant="default" className="flex items-center gap-1" data-testid="badge-total-files">
                    <FileStack className="w-3 h-3" />
                    {allResult.totalImports} files
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground">
                {mode === "all" ? (
                  <span className="font-medium text-foreground">Analysis of All Files</span>
                ) : (
                  <>
                    ID Analysis for: <span className="font-medium text-foreground">{importName}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {mode === "single" && (
              <Button variant="outline" onClick={handleReset} data-testid="button-reset">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset (View All)
              </Button>
            )}
            <Button
              variant="outline"
              onClick={mode === "single" ? fetchSingleAnalysis : fetchAllAnalysis}
              disabled={loading}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="glass-wrapper p-6 mb-6 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-destructive font-medium">{error}</p>
            <Button className="mt-4" onClick={() => onNavigate("saved")} data-testid="button-go-saved">
              Go to Saved
            </Button>
          </div>
        )}

        {loading && (
          renderLoadingSkeleton()
        )}

        {!loading && !error && analysis && (
          <>
            <div className="glass-wrapper p-4 mb-6">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <span className="text-muted-foreground">Total Rows:</span>
                  <span className="font-bold text-foreground">{totalRows.toLocaleString()}</span>
                </div>
                {mode === "single" && singleResult && (
                  <Badge variant="outline">{singleResult.import.filename}</Badge>
                )}
                {mode === "all" && allResult && (
                  <Badge variant="outline">{allResult.totalImports} files combined</Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="glass-wrapper border-0">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-foreground">Gender Distribution (IC)</CardTitle>
                </CardHeader>
                <CardContent>
                  {genderPieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={genderPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {genderPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => value.toLocaleString()} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No IC data to display
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-wrapper border-0">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-foreground">ID Category Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={categoryBarData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => value.toLocaleString()} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <h2 className="text-lg font-semibold text-foreground mb-4">ID Type Detection</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {renderCategoryCard("IC Male", Users, analysis.icLelaki, "text-blue-500")}
              {renderCategoryCard("IC Female", Users, analysis.icPerempuan, "text-pink-500")}
              {renderCategoryCard("Police No.", Shield, analysis.noPolis, "text-yellow-600")}
              {renderCategoryCard("Military No.", Shield, analysis.noTentera, "text-green-600")}
              {renderCategoryCard("Passport Malaysia", Plane, analysis.passportMY, "text-purple-500")}
              {renderCategoryCard("Foreign Passport", Plane, analysis.passportLuarNegara, "text-orange-500")}
            </div>

            {(analysis.noPolis.samples?.length > 0 ||
              analysis.noTentera.samples?.length > 0 ||
              analysis.passportMY.samples?.length > 0 ||
              analysis.passportLuarNegara.samples?.length > 0) && (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-4">Special ID List (Click to view, up to 50 samples)</h2>
                <div className="space-y-3 mb-8">
                  {renderExpandableSection("polis", "Police No.", Shield, analysis.noPolis.samples || [], "text-yellow-600")}
                  {renderExpandableSection("tentera", "Military No.", Shield, analysis.noTentera.samples || [], "text-green-600")}
                  {renderExpandableSection("passportMY", "Passport Malaysia", Plane, analysis.passportMY.samples || [], "text-purple-500")}
                  {renderExpandableSection("passportLN", "Foreign Passport", Plane, analysis.passportLuarNegara.samples || [], "text-orange-500")}
                </div>
              </>
            )}

            {mode === "all" && allResult && allResult.imports.length > 0 && (
              <Collapsible open={filesListOpen} onOpenChange={setFilesListOpen} className="mb-8">
                <div className="glass-wrapper p-4">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto" data-testid="button-toggle-files-list">
                      <div className="flex items-center gap-2">
                        <FileStack className="w-5 h-5 text-primary" />
                        <span className="font-semibold text-foreground">Analyzed Files List</span>
                        <span className="text-sm text-muted-foreground">({allResult.imports.length})</span>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${filesListOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-4 max-h-[400px] overflow-y-auto">
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0 z-10">
                            <tr>
                              <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Filename</th>
                              <th className="text-right p-3 font-medium text-muted-foreground">Row Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allResult.imports.map((imp, idx) => (
                              <tr key={imp.id} className="border-t border-border hover:bg-muted/50">
                                <td className="p-3 text-muted-foreground">{idx + 1}</td>
                                <td className="p-3 font-medium text-foreground">{imp.name}</td>
                                <td className="p-3 text-muted-foreground">{imp.filename}</td>
                                <td className="p-3 text-right">
                                  <Badge variant="secondary">{(imp.rowCount || 0).toLocaleString()}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            <Collapsible open={duplicatesOpen} onOpenChange={setDuplicatesOpen}>
              <div className="glass-wrapper p-4">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-0 h-auto" data-testid="button-toggle-duplicates">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <span className="font-semibold text-foreground">Duplicate Values</span>
                      <span className="text-sm text-muted-foreground">({analysis.duplicates.count})</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${duplicatesOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {analysis.duplicates.count === 0 ? (
                    <div className="mt-4 p-6 text-center">
                      <p className="text-muted-foreground">No duplicate values found.</p>
                    </div>
                  ) : (
                    <div className="mt-4 max-h-[400px] overflow-y-auto">
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Value</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Count</th>
                              <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.duplicates.items.map((dup, idx) => (
                              <tr key={idx} className="border-t border-border hover:bg-muted/50">
                                <td className="p-3 text-muted-foreground">{idx + 1}</td>
                                <td className="p-3 font-mono text-foreground">{dup.value}</td>
                                <td className="p-3">
                                  <Badge variant="destructive">{dup.count}x</Badge>
                                </td>
                                <td className="p-3">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(dup.value)}
                                    data-testid={`button-copy-dup-${idx}`}
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          </>
        )}
      </div>
    </div>
  );
}
