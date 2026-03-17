import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Eye,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fetchCollectionReceiptBlob,
  getCollectionDailyDayDetails,
  getCollectionDailyOverview,
  getCollectionDailyUsers,
  setCollectionDailyCalendar,
  setCollectionDailyTarget,
  type CollectionDailyDayDetailsResponse,
  type CollectionDailyOverviewResponse,
  type CollectionDailyUser,
} from "@/lib/api";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { useToast } from "@/hooks/use-toast";
import { formatAmountRM, getCurrentUsername, parseApiError } from "@/pages/collection/utils";

type CollectionDailyPageProps = {
  role: string;
};

type EditableCalendarDay = {
  day: number;
  isWorkingDay: boolean;
  isHoliday: boolean;
  holidayName: string;
};

const DAY_DETAILS_PAGE_SIZE = 10;

function statusCardClass(status: "green" | "yellow" | "red" | "neutral") {
  if (status === "green") return "border-green-400/50 bg-green-50/70";
  if (status === "yellow") return "border-amber-400/60 bg-amber-50/70";
  if (status === "red") return "border-rose-400/50 bg-rose-50/70";
  return "border-slate-300/50 bg-slate-100/80";
}

function statusLabel(status: "green" | "yellow" | "red" | "neutral") {
  if (status === "green") return "Target achieved";
  if (status === "yellow") return "Target not achieved";
  if (status === "red") return "No collection";
  return "Holiday / non-working";
}

function statusTextClass(status: "green" | "yellow" | "red" | "neutral") {
  if (status === "green") return "text-green-700";
  if (status === "yellow") return "text-amber-700";
  if (status === "red") return "text-rose-700";
  return "text-slate-600";
}

export default function CollectionDailyPage({ role }: CollectionDailyPageProps) {
  const { toast } = useToast();
  const now = useMemo(() => new Date(), []);
  const canManage = role === "admin" || role === "superuser";
  const currentUsername = useMemo(() => getCurrentUsername(), []);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [users, setUsers] = useState<CollectionDailyUser[]>([]);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);

  const [overview, setOverview] = useState<CollectionDailyOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [savingTarget, setSavingTarget] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [monthlyTargetInput, setMonthlyTargetInput] = useState("0");
  const [calendarDays, setCalendarDays] = useState<EditableCalendarDay[]>([]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<CollectionDailyDayDetailsResponse | null>(null);
  const [loadingDayDetails, setLoadingDayDetails] = useState(false);
  const [loadingReceiptKey, setLoadingReceiptKey] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    const run = async () => {
      setLoadingUsers(true);
      try {
        const response = await getCollectionDailyUsers();
        const nextUsers = Array.isArray(response?.users) ? response.users : [];
        setUsers(nextUsers);
        setSelectedUsernames((previous) => {
          const available = new Set(nextUsers.map((item) => item.username.toLowerCase()));
          const kept = previous.filter((value) => available.has(value.toLowerCase()));
          if (kept.length > 0) {
            return kept;
          }
          if (nextUsers.length > 0) {
            return [nextUsers[0].username.toLowerCase()];
          }
          return [];
        });
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
  }, [canManage, toast]);

  useEffect(() => {
    if (!canManage) {
      setSelectedUsernames(currentUsername ? [currentUsername] : []);
    }
  }, [canManage, currentUsername]);

  const selectedUserSet = useMemo(
    () => new Set(selectedUsernames.map((value) => value.toLowerCase())),
    [selectedUsernames],
  );
  const allUsersSelected = canManage && users.length > 0 && selectedUserSet.size === users.length;
  const partiallySelected = canManage && selectedUserSet.size > 0 && !allUsersSelected;
  const canEditTarget = canManage && selectedUsernames.length === 1;

  const selectedUsersLabel = useMemo(() => {
    if (!canManage) return currentUsername || "-";
    if (selectedUsernames.length === 0) return "Select users";
    if (selectedUsernames.length === 1) {
      const matched = users.find((item) => item.username.toLowerCase() === selectedUsernames[0]);
      return matched ? `${matched.username} (${matched.role})` : selectedUsernames[0];
    }
    return `${selectedUsernames.length} users selected`;
  }, [canManage, currentUsername, selectedUsernames, users]);

  const selectedQueryUsers = useMemo(
    () => (canManage ? selectedUsernames : undefined),
    [canManage, selectedUsernames],
  );

  const loadOverview = async () => {
    if (canManage && selectedUsernames.length === 0) {
      setOverview(null);
      return;
    }
    if (!canManage && !currentUsername) {
      setOverview(null);
      return;
    }

    setLoadingOverview(true);
    try {
      const response = await getCollectionDailyOverview({
        year,
        month,
        usernames: selectedQueryUsers,
      });
      setOverview(response);
      if (canEditTarget) {
        setMonthlyTargetInput(String(response.summary.monthlyTarget || 0));
      }
      setCalendarDays(response.days.map((day) => ({
        day: day.day,
        isWorkingDay: day.isWorkingDay,
        isHoliday: day.isHoliday,
        holidayName: day.holidayName || "",
      })));
      setSelectedDate(null);
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
    if (canManage && selectedUsernames.length === 0) return;
    if (!canManage && !currentUsername) return;
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, currentUsername, canManage, selectedUsernames.join(",")]);

  const loadDayDetails = async (date: string, page = 1) => {
    setSelectedDate(date);
    setLoadingDayDetails(true);
    try {
      const response = await getCollectionDailyDayDetails({
        date,
        usernames: selectedQueryUsers,
        page,
        pageSize: DAY_DETAILS_PAGE_SIZE,
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

  const saveMonthlyTarget = async () => {
    if (!canManage) return;
    if (!canEditTarget) {
      toast({
        title: "Select One User",
        description: "Please select exactly one user to update monthly target.",
        variant: "destructive",
      });
      return;
    }
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
        username: selectedUsernames[0],
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

  const firstWeekday = useMemo(
    () => new Date(year, month - 1, 1).getDay(),
    [year, month],
  );

  const toggleSelectedUser = (username: string, checked: boolean) => {
    const normalized = username.toLowerCase();
    setSelectedUsernames((previous) => {
      const nextSet = new Set(previous.map((value) => value.toLowerCase()));
      if (checked) nextSet.add(normalized);
      else nextSet.delete(normalized);
      return Array.from(nextSet);
    });
  };

  const selectAllUsers = () => {
    setSelectedUsernames(users.map((item) => item.username.toLowerCase()));
  };

  const clearSelectedUsers = () => {
    setSelectedUsernames([]);
  };

  const viewReceipt = async (recordId: string, receiptId?: string) => {
    const key = `${recordId}:${receiptId || "primary"}`;
    setLoadingReceiptKey(key);
    try {
      const { blob } = await fetchCollectionReceiptBlob(recordId, "view", receiptId);
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.href = url;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: unknown) {
      toast({
        title: "Failed to View Receipt",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setLoadingReceiptKey(null);
    }
  };

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
                <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between" disabled={loadingUsers}>
                      <span className="truncate text-left">{selectedUsersLabel}</span>
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[340px] p-2">
                    {users.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">No users available.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allUsersSelected ? true : partiallySelected ? "indeterminate" : false}
                              onCheckedChange={(checked) => {
                                if (checked === true) selectAllUsers();
                                else clearSelectedUsers();
                              }}
                              disabled={loadingUsers}
                            />
                            <span className="text-xs font-medium">Select all users</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={clearSelectedUsers}
                            disabled={selectedUsernames.length === 0 || loadingUsers}
                          >
                            Clear
                          </Button>
                        </div>

                        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                          {users.map((userItem) => {
                            const normalized = userItem.username.toLowerCase();
                            const checked = selectedUserSet.has(normalized);
                            return (
                              <label
                                key={userItem.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent/40"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(state) => toggleSelectedUser(userItem.username, state === true)}
                                  disabled={loadingUsers}
                                />
                                <span className="text-sm">
                                  {userItem.username} ({userItem.role})
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              ) : (
                <Input value={currentUsername} readOnly />
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
                  disabled={!canEditTarget}
                />
                {!canEditTarget ? (
                  <p className="text-xs text-muted-foreground">
                    Select exactly one user to edit monthly target.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveMonthlyTarget()} disabled={savingTarget || !canEditTarget}>
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
          <CardContent className="space-y-3 pt-6">
            <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
              <div>Monthly Target: <span className="font-semibold">{formatAmountRM(overview.summary.monthlyTarget)}</span></div>
              <div>Collected: <span className="font-semibold">{formatAmountRM(overview.summary.collectedAmount)}</span></div>
              <div>Balanced: <span className="font-semibold">{formatAmountRM(overview.summary.balancedAmount)}</span></div>
              <div>Daily Target: <span className="font-semibold">{formatAmountRM(overview.summary.dailyTarget)}</span></div>
              <div>Working Days: <span className="font-semibold">{overview.summary.workingDays}</span></div>
              <div>Completed Days: <span className="font-semibold text-green-700">{overview.summary.completedDays}</span></div>
              <div>Incomplete Days: <span className="font-semibold text-amber-700">{overview.summary.incompleteDays}</span></div>
              <div>No Collection Days: <span className="font-semibold text-rose-700">{overview.summary.noCollectionDays}</span></div>
            </div>
            <p className="text-xs text-muted-foreground">
              Carry-forward rule: shortfall from a working day is added to the next working day target. Excess collection reduces future required target.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="text-lg">Monthly Daily Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-2 rounded border border-rose-300/60 bg-rose-50/70 px-2 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span>Red: No collection</span>
            </div>
            <div className="flex items-center gap-2 rounded border border-amber-300/60 bg-amber-50/70 px-2 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>Yellow: Collection recorded but daily target not achieved</span>
            </div>
            <div className="flex items-center gap-2 rounded border border-green-300/60 bg-green-50/70 px-2 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span>Green: Daily target achieved</span>
            </div>
            <div className="flex items-center gap-2 rounded border border-slate-300/60 bg-slate-100/80 px-2 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
              <span>Grey: Holiday / non-working day</span>
            </div>
          </div>

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
                    <button
                      key={day.date}
                      type="button"
                      className={`rounded-md border p-2 text-left text-xs transition-colors hover:brightness-95 ${statusCardClass(day.status)}`}
                      onClick={() => void loadDayDetails(day.date, 1)}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <div className="font-semibold">{day.day}</div>
                        {day.status === "green" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-700" /> : null}
                        {day.status === "yellow" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-700" /> : null}
                        {day.status === "red" ? <CircleSlash className="h-3.5 w-3.5 text-rose-700" /> : null}
                      </div>
                      <div className={statusTextClass(day.status)}>{statusLabel(day.status)}</div>
                      <div>Collected: {formatAmountRM(day.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">Target: {formatAmountRM(day.target)}</div>
                      {canManage && editable ? (
                        <div className="mt-1 space-y-1" onClick={(event) => event.stopPropagation()}>
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
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedDate)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDate(null);
            setDayDetails(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Collection Day Details - {selectedDate ? formatDateDDMMYYYY(selectedDate) : "-"}
            </DialogTitle>
            <DialogDescription>
              View collection records, stored receipts, and daily target status for the selected date.
            </DialogDescription>
          </DialogHeader>

          {loadingDayDetails ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading day details...
            </div>
          ) : !dayDetails ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No details available.</div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 overflow-hidden">
              <div className="grid gap-2 rounded-md border border-border/60 bg-background/70 p-3 text-sm md:grid-cols-2 lg:grid-cols-4">
                <div>Status: <span className={`font-semibold ${statusTextClass(dayDetails.status)}`}>{statusLabel(dayDetails.status)}</span></div>
                <div>Daily Target: <span className="font-semibold">{formatAmountRM(dayDetails.dailyTarget)}</span></div>
                <div>Collected: <span className="font-semibold">{formatAmountRM(dayDetails.amount)}</span></div>
                <div>Balanced: <span className="font-semibold">{formatAmountRM(Math.max(0, dayDetails.dailyTarget - dayDetails.amount))}</span></div>
                <div className="md:col-span-2 lg:col-span-4 text-muted-foreground">{dayDetails.message}</div>
              </div>

              <div className="flex-1 space-y-2 overflow-auto pr-1">
                {dayDetails.records.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    No collection records for this date.
                  </div>
                ) : (
                  dayDetails.records.map((record) => (
                    <div key={record.id} className="space-y-2 rounded-md border border-border/60 bg-background/70 p-3">
                      <div className="grid gap-1 text-sm md:grid-cols-2 xl:grid-cols-3">
                        <div>Customer: <span className="font-medium">{record.customerName}</span></div>
                        <div>Account: <span className="font-medium">{record.accountNumber}</span></div>
                        <div>Amount: <span className="font-medium">{formatAmountRM(record.amount)}</span></div>
                        <div>User: <span className="font-medium">{record.username}</span></div>
                        <div>Nickname: <span className="font-medium">{record.collectionStaffNickname}</span></div>
                        <div>Reference: <span className="font-medium">{record.paymentReference}</span></div>
                        <div>Batch: <span className="font-medium">{record.batch}</span></div>
                        <div>Date: <span className="font-medium">{formatDateDDMMYYYY(record.paymentDate)}</span></div>
                        <div>Created: <span className="font-medium">{formatDateTimeDDMMYYYY(record.createdAt)}</span></div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Stored Receipts
                        </div>
                        {record.receipts.length === 0 && !record.receiptFile ? (
                          <div className="text-xs text-muted-foreground">No stored receipt.</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {record.receipts.map((receipt) => {
                              const key = `${record.id}:${receipt.id}`;
                              return (
                                <Button
                                  key={receipt.id}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={loadingReceiptKey === key}
                                  onClick={() => void viewReceipt(record.id, receipt.id)}
                                >
                                  {loadingReceiptKey === key ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-2 h-3.5 w-3.5" />}
                                  {receipt.originalFileName}
                                </Button>
                              );
                            })}
                            {record.receipts.length === 0 && record.receiptFile ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={loadingReceiptKey === `${record.id}:primary`}
                                onClick={() => void viewReceipt(record.id)}
                              >
                                {loadingReceiptKey === `${record.id}:primary`
                                  ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  : <Eye className="mr-2 h-3.5 w-3.5" />}
                                View Receipt
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm">
                <div className="text-muted-foreground">
                  Page {dayDetails.pagination.page} of {dayDetails.pagination.totalPages} | Records {dayDetails.pagination.totalRecords}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!dayDetails.pagination.hasPreviousPage || loadingDayDetails || !selectedDate}
                    onClick={() => selectedDate && void loadDayDetails(selectedDate, dayDetails.pagination.page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!dayDetails.pagination.hasNextPage || loadingDayDetails || !selectedDate}
                    onClick={() => selectedDate && void loadDayDetails(selectedDate, dayDetails.pagination.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
