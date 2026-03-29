import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";

interface AnalysisChartsProps {
  categoryBarData: { name: string; count: number; fill: string }[];
  genderPieData: { name: string; value: number; color: string }[];
}

export function AnalysisCharts({ categoryBarData, genderPieData }: AnalysisChartsProps) {
  const isMobile = useIsMobile();

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      <Card className="glass-wrapper border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">Gender Distribution (IC)</CardTitle>
        </CardHeader>
        <CardContent>
          {genderPieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={isMobile ? 220 : 250}>
                <PieChart>
                  <Pie
                    data={genderPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={isMobile ? false : ({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={isMobile ? 68 : 80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {genderPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                  {!isMobile ? <Legend /> : null}
                </PieChart>
              </ResponsiveContainer>

              {isMobile ? (
                <div className="mt-3 grid gap-2">
                  {genderPieData.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden="true"
                        />
                        <span className="text-foreground">{entry.name}</span>
                      </div>
                      <span className="font-medium text-foreground">{entry.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground">
              No IC data to display
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-wrapper border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">ID Category Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 250}>
            <BarChart
              data={categoryBarData}
              layout="vertical"
              margin={isMobile ? { top: 4, right: 8, bottom: 4, left: 0 } : { top: 0, right: 0, bottom: 0, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="name"
                width={isMobile ? 88 : 100}
                tick={{ fontSize: isMobile ? 11 : 12 }}
              />
              <Tooltip formatter={(value: number) => value.toLocaleString()} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
