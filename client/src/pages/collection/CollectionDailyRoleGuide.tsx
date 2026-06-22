import { CalendarCheck2, ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    <section className="collection-daily-role-guide" aria-label="Collection Daily role guidance">
      <div className="collection-daily-role-guide-icon" aria-hidden="true">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-2xs">
            {content.label}
          </Badge>
          <Badge variant="outline" className="max-w-full rounded-full px-3 py-1 text-2xs">
            <CalendarCheck2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{selectedUsersLabel}</span>
          </Badge>
        </div>

        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{content.title}</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {content.description}
          </p>
        </div>
      </div>

      <div className="collection-daily-role-guide-facts" aria-label="Role capabilities">
        {content.facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </div>
    </section>
  );
}
