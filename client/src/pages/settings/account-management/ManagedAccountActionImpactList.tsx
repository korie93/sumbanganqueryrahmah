import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ManagedAccountActionImpactItem } from "@/pages/settings/account-management/managed-accounts-shared";

type ManagedAccountActionImpactListProps = {
  items: ManagedAccountActionImpactItem[];
};

function getImpactIcon(item: ManagedAccountActionImpactItem) {
  if (item.tone === "danger") return ShieldAlert;
  if (item.tone === "warning") return AlertTriangle;
  if (item.tone === "success") return CheckCircle2;
  return Info;
}

function getImpactToneClass(item: ManagedAccountActionImpactItem) {
  if (item.tone === "danger") return "border-destructive/35 bg-destructive/10 text-destructive";
  if (item.tone === "warning") return "border-amber-600/40 bg-amber-500/10 text-foreground";
  if (item.tone === "success") return "border-emerald-600/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return "border-border/70 bg-muted/20 text-muted-foreground";
}

export function ManagedAccountActionImpactList({
  items,
}: ManagedAccountActionImpactListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="mt-4 space-y-2 text-left" aria-label="Action impact">
      {items.map((item) => {
        const ImpactIcon = getImpactIcon(item);

        return (
          <li
            key={item.id}
            className={cn(
              "flex gap-3 rounded-lg border p-3 text-sm",
              getImpactToneClass(item),
            )}
          >
            <ImpactIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{item.label}</span>
              <span className="block text-muted-foreground">{item.description}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
