import { memo, useMemo, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  Globe2,
  ListChecks,
  MonitorSmartphone,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  buildDashboardSuspiciousLoginReviewSteps,
  type DashboardSuspiciousLoginItem,
  type SuspiciousLoginTone,
} from "@/pages/dashboard/dashboard-suspicious-login-model";

interface DashboardSuspiciousLoginInvestigationSheetProps {
  canOpenFullAudit: boolean;
  canViewExactNetwork: boolean;
  item: DashboardSuspiciousLoginItem | null;
  onOpenChange: (open: boolean) => void;
  onReviewRelated: () => void;
}

const TONE_CLASS_BY_TONE: Record<SuspiciousLoginTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  warning:
    "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

function InvestigationFact({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/10 p-3">
      <p className="text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 min-w-0 break-words text-sm font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

function DashboardSuspiciousLoginInvestigationSheetImpl({
  canOpenFullAudit,
  canViewExactNetwork,
  item,
  onOpenChange,
  onReviewRelated,
}: DashboardSuspiciousLoginInvestigationSheetProps) {
  const reviewSteps = useMemo(
    () => (item ? buildDashboardSuspiciousLoginReviewSteps(item) : []),
    [item],
  );

  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(96vw,42rem)] overflow-y-auto sm:max-w-2xl"
        data-testid="dashboard-suspicious-login-investigation-sheet"
      >
        {item ? (
          <div className="flex min-h-full flex-col pr-1">
            <div className="space-y-5">
              <SheetHeader className="pr-8">
                <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
                  Incident Review
                </p>
                <SheetTitle className="break-words">
                  Siasatan login: {item.activity.username}
                </SheetTitle>
                <SheetDescription>
                  Nilai identiti, rangkaian, peranti dan masa sebelum mengambil
                  tindakan pada akaun.
                </SheetDescription>
              </SheetHeader>

              <div
                className="flex flex-wrap gap-2"
                aria-label="Ringkasan tahap insiden"
              >
                <Badge
                  variant="outline"
                  className={`rounded-full ${TONE_CLASS_BY_TONE[item.tone]}`}
                >
                  {item.severityLabel}
                </Badge>
                <Badge variant="outline" className="rounded-full capitalize">
                  {item.activity.role}
                </Badge>
                <Badge variant="outline" className="rounded-full capitalize">
                  {item.activity.status}
                </Badge>
              </div>

              <section
                className={`rounded-xl border p-3 ${TONE_CLASS_BY_TONE[item.tone]}`}
                aria-labelledby="dashboard-login-investigation-reason"
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <h3
                      id="dashboard-login-investigation-reason"
                      className="text-sm font-semibold"
                    >
                      Sebab diletakkan dalam watchlist
                    </h3>
                    <p className="mt-1 break-words text-xs leading-5">
                      {item.reasonLabel}
                    </p>
                  </div>
                </div>
              </section>

              <section aria-labelledby="dashboard-login-investigation-context">
                <div className="flex items-center gap-2">
                  <UserRound
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3
                    id="dashboard-login-investigation-context"
                    className="text-sm font-semibold text-foreground"
                  >
                    Konteks kejadian
                  </h3>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <InvestigationFact label="Pengguna">
                    {item.activity.username}
                  </InvestigationFact>
                  <InvestigationFact label="Peranan">
                    {item.activity.role}
                  </InvestigationFact>
                  <InvestigationFact
                    label={
                      canViewExactNetwork ? "Alamat IP" : "Rangkaian (dimask)"
                    }
                  >
                    <span className="break-all" data-export-sensitive="true">
                      {item.networkLabel}
                    </span>
                  </InvestigationFact>
                  <InvestigationFact label="Tarikh dan waktu">
                    <time dateTime={item.eventTime ?? undefined}>
                      {item.eventTimeLabel}
                    </time>
                  </InvestigationFact>
                  <InvestigationFact label="Browser dan platform">
                    {item.deviceLabel}
                  </InvestigationFact>
                  <InvestigationFact label="Ringkasan peranti">
                    {item.activity.userAgentSummary ?? item.deviceLabel}
                  </InvestigationFact>
                </div>
              </section>

              <section aria-labelledby="dashboard-login-investigation-signals">
                <div className="flex items-center gap-2">
                  <ListChecks
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3
                    id="dashboard-login-investigation-signals"
                    className="text-sm font-semibold text-foreground"
                  >
                    Langkah semakan dicadangkan
                  </h3>
                </div>
                <ol className="mt-3 grid gap-2">
                  {reviewSteps.map((step, index) => (
                    <li
                      key={step.id}
                      className="flex items-start gap-3 rounded-lg border border-border/60 p-3"
                    >
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {step.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {step.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <p className="flex items-start gap-2">
                  <Globe2
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  IP penuh hanya untuk peranan berizin.
                </p>
                <p className="flex items-start gap-2">
                  <MonitorSmartphone
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  Peranti ialah signal, bukan bukti muktamad.
                </p>
                <p className="flex items-start gap-2">
                  <CalendarClock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  Sahkan masa dengan pemilik akaun.
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-background px-4 pb-[calc(var(--safe-area-inset-bottom)+1rem)] pt-4 sm:-mx-6 sm:px-6">
              <SheetFooter className="gap-2 sm:space-x-0">
                {canOpenFullAudit ? (
                  <Button asChild variant="outline">
                    <a href="/monitor?section=activity">
                      Audit penuh
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                ) : null}
                <Button type="button" onClick={onReviewRelated}>
                  Semak rekod berkaitan
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </SheetFooter>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export const DashboardSuspiciousLoginInvestigationSheet = memo(
  DashboardSuspiciousLoginInvestigationSheetImpl,
);
