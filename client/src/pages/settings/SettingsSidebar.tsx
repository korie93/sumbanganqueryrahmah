import { ChevronRight, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SettingCategory } from "@/pages/settings/types";

interface SettingsSidebarProps {
  categories: SettingCategory[];
  categoryDirtyMap: Map<string, number>;
  onSelectCategory: (categoryId: string) => void;
  selectedCategory: string;
}

export function SettingsSidebar({
  categories,
  categoryDirtyMap,
  onSelectCategory,
  selectedCategory,
}: SettingsSidebarProps) {
  return (
    <Card className="col-span-12 lg:col-span-3 border-border/60 bg-background/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings2 className="w-4 h-4" />
          Settings Navigation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {categories.map((category) => {
          const categoryDirty = categoryDirtyMap.get(category.id) || 0;
          const active = selectedCategory === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(category.id)}
              title={category.description || `Open ${category.name} settings`}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                active
                  ? "border-primary/70 bg-primary/10 shadow-sm"
                  : "border-border bg-background/40 hover:border-border/90 hover:bg-accent/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{category.name}</span>
                    {active ? <ChevronRight className="h-3.5 w-3.5 text-primary" /> : null}
                  </div>
                  {category.description ? (
                    <p className="text-xs text-muted-foreground">{category.description}</p>
                  ) : null}
                </div>
                {categoryDirty > 0 ? <Badge variant="secondary">{categoryDirty}</Badge> : null}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
