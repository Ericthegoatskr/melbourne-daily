const dateFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayLabelFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  month: "short",
  day: "numeric",
});

export function melbourneDate(value: number | string): string {
  const parts = dateFormatter.formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function forecastDayLabel(date: string, now: number): string {
  const today = melbourneDate(now);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  return dayLabelFormatter.format(new Date(`${date}T12:00:00Z`));
}

export function forecastIsDay(
  time: string,
  days: Array<{ sunrise: string; sunset: string }>,
): boolean {
  const timestamp = Date.parse(time);
  return days.some(
    (day) =>
      timestamp >= Date.parse(day.sunrise) &&
      timestamp < Date.parse(day.sunset),
  );
}
