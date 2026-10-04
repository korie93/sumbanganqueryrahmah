import { CalendarCheck2, ChevronDown, ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CollectionDailyRoleGuideProps = {
  role: string;
  selectedUsersLabel: string;
  canManage: boolean;
  canEditCalendar: boolean;
};

function getRoleGuideContent(role: string, canManage: boolean, canEditCalendar: boolean) {
  if (canEditCalendar) {
    return {
      icon: ShieldCheck,
      label: "Superuser workspace",
      title: "Kawal target dan status harian ikut nickname",
      description:
        "Set Working, Holiday/Leave atau OFF untuk satu nickname tanpa mengubah nickname lain.",
      facts: ["Target bulanan", "Status Working/Holiday/OFF", "Edit per nickname"],
    };
  }

  if (role === "manager") {
    return {
      icon: UsersRound,
      label: "Manager read-only",
      title: "Pantau prestasi semua staf tanpa mengubah rekod",
      description:
        "Pilih satu atau beberapa nickname untuk menilai target, kutipan dan butiran harian. Kawalan target dan calendar kekal dilindungi.",
      facts: ["All staff view", "Target progress", "No mutations"],
    };
  }

  if (canManage) {
    return {
      icon: UserRoundCog,
      label: "Admin workspace",
      title: "Pantau prestasi staf dengan scope yang jelas",
      description:
        "Pilih satu atau beberapa nickname untuk semak collection harian. Status calendar dikawal oleh superuser.",
      facts: ["Staff scope", "Target view", "Daily details"],
    };
  }

  return {
    icon: UsersRound,
    label: role ? `${role} workspace` : "User workspace",
    title: "Lihat prestasi harian sendiri",
    description:
      "Semak target, kutipan, baki dan hari Working/Holiday yang sudah ditetapkan untuk akaun anda.",
    facts: ["Own daily view", "Target progress", "Receipt details"],
  };
}

export function CollectionDailyRoleGuide({
  role,
  selectedUsersLabel,
  canManage,
  canEditCalendar,
}: CollectionDailyRoleGuideProps) {
  const content = getRoleGuideContent(role, canManage, canEditCalendar);
  const Icon = content.icon;

  return (
    <section aria-label="Collection Daily role guidance">
      <details className="group border-b border-border pb-2">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 rounded-md py-2 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className={badgeVariants({ variant: "secondary" })}>
            {content.label}
          </span>
          <span className={cn(badgeVariants({ variant: "outline" }), "max-w-full")}>
            <CalendarCheck2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{selectedUsersLabel}</span>
          </span>
          <span className="ml-auto text-xs text-muted-foreground">Role guidance</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-medium text-foreground">{content.title}</h2>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
            {content.description}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Role capabilities">
            {content.facts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
        </div>
      </details>
    </section>
  );
}
