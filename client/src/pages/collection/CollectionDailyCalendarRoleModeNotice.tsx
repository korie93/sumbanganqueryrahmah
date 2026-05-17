import { Eye, ShieldCheck } from "lucide-react";

type CollectionDailyCalendarRoleModeNoticeProps = {
  canEditCalendar: boolean;
};

export function CollectionDailyCalendarRoleModeNotice({
  canEditCalendar,
}: CollectionDailyCalendarRoleModeNoticeProps) {
  const Icon = canEditCalendar ? ShieldCheck : Eye;

  return (
    <section className="collection-daily-calendar-role-mode" aria-label="Calendar access mode">
      <Icon className="h-4 w-4" aria-hidden="true" />
      <div>
        <p>{canEditCalendar ? "Mode superuser" : "Mode view sahaja"}</p>
        <span>
          {canEditCalendar
            ? "Anda boleh edit status harian untuk nickname dipilih sahaja."
            : "Status, leave type dan remark dipaparkan tanpa kawalan edit."}
        </span>
      </div>
    </section>
  );
}
