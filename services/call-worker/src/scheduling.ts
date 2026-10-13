import { Temporal } from "@js-temporal/polyfill";
export function nextOccurrence(
  localTime: string,
  timezone: string,
  weekdays: number[],
  after = new Date(),
) {
  const instant = Temporal.Instant.from(after.toISOString());
  const local = instant.toZonedDateTimeISO(timezone);
  const [hour, minute] = localTime.split(":").map(Number);
  if (
    hour === undefined ||
    minute === undefined ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    !weekdays.length
  )
    throw new Error("Invalid schedule");
  for (let offset = 0; offset < 15; offset++) {
    const date = local.toPlainDate().add({ days: offset });
    if (!weekdays.includes(date.dayOfWeek)) continue;
    const candidate = Temporal.ZonedDateTime.from(
      {
        timeZone: timezone,
        year: date.year,
        month: date.month,
        day: date.day,
        hour,
        minute,
      },
      { disambiguation: "earlier" },
    );
    if (candidate.hour !== hour || candidate.minute !== minute) continue;
    if (Temporal.Instant.compare(candidate.toInstant(), instant) > 0)
      return new Date(Number(candidate.epochMilliseconds));
  }
  throw new Error("No occurrence found");
}
