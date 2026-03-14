import { Settings2 } from "lucide-react";
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
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Settings Categories
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
              className={`w-full text-left rounded-md border px-3 py-2 transition ${
                active ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:bg-accent/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{category.name}</span>
                {categoryDirty > 0 ? <Badge variant="secondary">{categoryDirty}</Badge> : null}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
