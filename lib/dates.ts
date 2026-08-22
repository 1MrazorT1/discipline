export const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const dayBounds = (date: Date) => {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

export const formatDayTitle = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Determine the effective daily goal kcal for a given day.
 * If the day is before the user's effective_date, the default
 * budget applies (2000 kcal). Otherwise the user's set daily goal
 * is used. (Issue #19)
 */
export const getEffectiveDailyGoal = (
  dailyGoalKcal: number | undefined,
  effectiveDate: string | null | undefined,
  day: Date,
): number => {
  const goal = dailyGoalKcal ?? 2000;
  if (!effectiveDate) return goal;
  const effDate = new Date(effectiveDate);
  if (Number.isNaN(effDate.getTime())) return goal;
  // If selected day is at or after the effective date, use the new goal
  const dayStart = startOfDay(day);
  if (dayStart.getTime() >= startOfDay(effDate).getTime()) return goal;
  // Day is before the effective date — use the default budget
  return 2000;
};
