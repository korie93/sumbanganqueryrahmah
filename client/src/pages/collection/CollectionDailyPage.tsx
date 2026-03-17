import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, CircleSlash, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCollectionDailyDayDetails,
  getCollectionDailyOverview,
  getCollectionDailyUsers,
  setCollectionDailyCalendar,
  setCollectionDailyTarget,
  type CollectionDailyOverviewResponse,
  type CollectionDailyUser,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatAmountRM, getCurrentUsername, parseApiError } from "@/pages/collection/utils";
import { formatDateDDMMYYYY, formatIsoDateToDDMMYYYY } from "@/lib/date-format";

type CollectionDailyPageProps = {
  role: string;
};

type EditableCalendarDay = {
  day: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string;
};

function statusCardClass(status: "green" | "yellow" | "red" | "neutral") {
  if (status === "green") return "border-green-400/50 bg-green-50/50";
  if (status === "yellow") return "border-amber-400/60 bg-amber-50/60";
  if (status === "red") return "border-rose-400/50 bg-rose-50/50";
  return "border-slate-300/50 bg-slate-50/60";
}

export default function CollectionDailyPage({ role }: CollectionDailyPageProps) {
  const { toast } = useToast();
  const now = useMemo(() => new Date(), []);
  const canManage = role === "admin" || role === "superuser";
  const currentUsername = useMemo(() => getCurrentUsername(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [users, setUsers] = useState<CollectionDailyUser[]>([]);
  const [selectedUsername, setSelectedUsername] = useState(currentUsername);
  const [overview, setOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [monthlyTargetInput, setMonthlyTargetInput] = useState("0");
  const [calendarDays, setCalendarDays] = useState<EditableCalendarDay[]>([]);
  const [selectedYellowDate, setSelectedYellowDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<Awaited<ReturnType<typeof getCollectionDailyDayDetails>> | null>(null);
  const [loadingDayDetails, setLoadingDayDetails] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    const run = async () => {
      setLoadingUsers(true);
      try {
        const response = await getCollectionDailyUsers();
        const nextUsers = Array.isArray(response?.users) ? response.users : [];
        setUsers(nextUsers);
        if (!selectedUsername && nextUsers.length > 0) {
          setSelectedUsername(nextUsers[0].username);
        }
      } catch (error: unknown) {
        toast({
          title: "Failed to Load Users",
          description: parseApiError(error),
          variant: "destructive",
        });
      } finally {
        setLoadingUsers(false);
      }
    };
    void run();
  }, [canManage, selectedUsername, toast]);

  const loadOverview = async () => {
    if (!selectedUsername) return;
    setLoadingOverview(true);
    try {
      const response = await getCollectionDailyOverview({
        year,
        month,
        username: canManage ? selectedUsername : undefined,
      });
      setOverview(response);
      setMonthlyTargetInput(String(response.summary.monthlyTarget || 0));
      setCalendarDays(response.days.map((day) => ({
        day: day.day,
        isWorkingDay: day.isWorkingDay,
        isHoliday: day.isHoliday,
        holidayName: day.holidayName || "",
      })));
      setSelectedYellowDate(null);
      setDayDetails(null);
    } catch (error: unknown) {
      setOverview(null);
      toast({
        title: "Failed to Load Collection Daily",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (!selectedUsername) return;
    void loadOverview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, selectedUsername]);

  const saveMonthlyTarget = async () => {
    const monthlyTarget = Number(monthlyTargetInput);
    if (!Number.isFinite(monthlyTarget) || monthlyTarget < 0) {
      toast({
        title: "Validation Error",
        description: "Monthly target must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }
    setSavingTarget(true);
    try {
      await setCollectionDailyTarget({
        username: selectedUsername,
        year,
        month,
        monthlyTarget,
      });
      toast({
        title: "Target Saved",
        description: "Monthly target has been updated.",
      });
      await loadOverview();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Target",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingTarget(false);
    }
  };

  const saveCalendar = async () => {
    if (!calendarDays.length) return;
    setSavingCalendar(true);
    try {
      await setCollectionDailyCalendar({
        year,
        month,
        days: calendarDays.map((day) => ({
          day: day.day,
          isWorkingDay: day.isWorkingDay,
          isHoliday: day.isHoliday,
          holidayName: day.holidayName || null,
        })),
      });
      toast({
        title: "Calendar Saved",
        description: "Working days and holiday settings have been updated.",
      });
      await loadOverview();
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Calendar",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingCalendar(false);
    }
  };

  const openYellowDetails = async (date: string) => {
    setSelectedYellowDate(date);
    setLoadingDayDetails(true);
    try {
      const response = await getCollectionDailyDayDetails({
        date,
        username: canManage ? selectedUsername : undefined,
      });
      setDayDetails(response);
    } catch (error: unknown) {
      setDayDetails(null);
      toast({
        title: "Failed to Load Day Details",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setLoadingDayDetails(false);
    }
  };

  const firstWeekday = useMemo(
    () => new Date(year, month - 1, 1).getDay(),
    [year, month],
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarDays className="h-5 w-5" />
            Collection Daily
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Year</Label>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(event) => setYear(Number(event.target.value || now.getFullYear()))}
              />
            </div>
            <div className="space-y-1">
              <Label>Month</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(event) => setMonth(Number(event.target.value || now.getMonth() + 1))}
              />
            </div>
            <div className="space-y-1">
              <Label>User</Label>
              {canManage ? (
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedUsername}
                  onChange={(event) => setSelectedUsername(event.target.value)}
                  disabled={loadingUsers}
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.username}>
                      {user.username} ({user.role})
                    </option>
                  ))}
                </select>
              ) : (
                <Input value={selectedUsername} readOnly />
              )}
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => void loadOverview()} disabled={loadingOverview}>
                {loadingOverview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </div>

          {canManage ? (
            <div className="grid gap-3 rounded-md border border-border/60 bg-background/60 p-3 md:grid-cols-[220px_auto] md:items-end">
              <div className="space-y-1">
                <Label>Monthly Target (RM)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={monthlyTargetInput}
                  onChange={(event) => setMonthlyTargetInput(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void saveMonthlyTarget()} disabled={savingTarget}>
                  {savingTarget ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Target
                </Button>
                <Button variant="outline" onClick={() => void saveCalendar()} disabled={savingCalendar || calendarDays.length === 0}>
                  {savingCalendar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Calendar
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {overview ? (
        <Card className="border-border/60 bg-background/70">
          <CardContent className="pt-6">
            <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
              <div>Monthly target: <span className="font-semibold">{formatAmountRM(overview.summary.monthlyTarget)}</span></div>
              <div>Achieved: <span className="font-semibold">{formatAmountRM(overview.summary.achievedAmount)}</span></div>
              <div>Remaining: <span className="font-semibold">{formatAmountRM(overview.summary.remainingAmount)}</span></div>
              <div>Daily target: <span className="font-semibold">{formatAmountRM(overview.summary.dailyTarget)}</span></div>
              <div>Working days: <span className="font-semibold">{overview.summary.workingDays}</span></div>
              <div>Met days: <span className="font-semibold text-green-700">{overview.summary.metDays}</span></div>
              <div>Not met days: <span className="font-semibold text-amber-700">{overview.summary.yellowDays}</span></div>
              <div>No collection days: <span className="font-semibold text-rose-700">{overview.summary.redDays}</span></div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="text-lg">Monthly Daily Status</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOverview ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Loading monthly daily status...
            </div>
          ) : !overview ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No overview data found.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
                <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: firstWeekday }).map((_, index) => (
                  <div key={`blank-${index}`} />
                ))}
                {overview.days.map((day) => {
                  const editable = calendarDays.find((item) => item.day === day.day);
                  return (
                    <div key={day.date} className={`rounded-md border p-2 text-xs ${statusCardClass(day.status)}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="font-semibold">{day.day}</div>
                        {day.status === "green" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-700" /> : null}
                        {day.status === "yellow" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-700" /> : null}
                        {day.status === "red" ? <CircleSlash className="h-3.5 w-3.5 text-rose-700" /> : null}
                      </div>
                      <div>{formatAmountRM(day.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">Target {formatAmountRM(day.target)}</div>
                      {canManage && editable ? (
                        <div className="mt-1 space-y-1">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={editable.isWorkingDay}
                              onChange={(event) => {
                                setCalendarDays((previous) =>
                                  previous.map((item) =>
                                    item.day === editable.day
                                      ? { ...item, isWorkingDay: event.target.checked }
                                      : item,
                                  ),
                                );
                              }}
                            />
                            Working
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={editable.isHoliday}
                              onChange={(event) => {
                                setCalendarDays((previous) =>
                                  previous.map((item) =>
                                    item.day === editable.day
                                      ? { ...item, isHoliday: event.target.checked }
                                      : item,
                                  ),
                                );
                              }}
                            />
                            Holiday
                          </label>
                        </div>
                      ) : null}
                      {day.status === "yellow" ? (
                        <Button
                          variant="link"
                          className="mt-1 h-auto p-0 text-[10px] text-amber-700"
                          onClick={() => void openYellowDetails(day.date)}
                        >
                          Daily target not achieved
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedYellowDate ? (
        <Card className="border-amber-300/60 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base">
              Day Details - {formatDateDDMMYYYY(selectedYellowDate)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDayDetails ? (
              <div className="text-sm text-muted-foreground">Loading details...</div>
            ) : dayDetails ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium">{dayDetails.message}</div>
                <div>
                  Amount: {formatAmountRM(dayDetails.amount)} | Daily target: {formatAmountRM(dayDetails.dailyTarget)}
                </div>
                <div className="font-medium">Customers who paid on {formatIsoDateToDDMMYYYY(dayDetails.date)}</div>
                {dayDetails.customers.length === 0 ? (
                  <div className="text-muted-foreground">No customer payment records.</div>
                ) : (
                  <div className="space-y-1">
                    {dayDetails.customers.map((customer) => (
                      <div key={customer.id} className="rounded border border-amber-200/60 bg-background/70 px-3 py-2">
                        {customer.customerName} ({customer.accountNumber}) - {formatAmountRM(customer.amount)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No details available.</div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

