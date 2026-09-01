import type { ScheduleResolution } from "./types.ts";

const TIMEZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
};

export const canonicalizeTimeZone = (value: string | null | undefined) => {
  const requested = value?.trim() || "UTC";
  const candidate = TIMEZONE_ALIASES[requested] ?? requested;
  const canonical = new Intl.DateTimeFormat("en", { timeZone: candidate })
    .resolvedOptions()
    .timeZone;
  return TIMEZONE_ALIASES[canonical] ?? canonical;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsInTimeZone = (date: Date, timeZone: string): DateParts => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as DateParts;
};

const addLocalDays = (parts: DateParts, days: number): DateParts => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    ...parts,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const wallClockToUtc = (parts: DateParts, timeZone: string) => {
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let candidate = wallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const zoned = partsInTimeZone(new Date(candidate), timeZone);
    const represented = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    candidate += wallClock - represented;
  }
  return new Date(candidate);
};

const localLabel = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

type ParsedClock = {
  hour: number;
  minute: number;
  clockLabel: string;
  ambiguous: boolean;
  valid: boolean;
};

const parseClock = (expression: string): ParsedClock | null => {
  const match = expression.match(
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i,
  );
  if (!match) return null;

  const rawHour = match[1];
  let hour = Number(rawHour);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLocaleLowerCase().startsWith("p")
    ? "PM"
    : match[3]
      ? "AM"
      : null;
  if (minute > 59) {
    return { hour, minute, clockLabel: match[0].replace(/^at\s+/i, "").trim(), ambiguous: false, valid: false };
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return { hour, minute, clockLabel: match[0].replace(/^at\s+/i, "").trim(), ambiguous: false, valid: false };
    }
    const clockLabel = `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
    hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
    return { hour, minute, clockLabel, ambiguous: false, valid: true };
  }

  // A leading zero or an hour outside the 12-hour range is an explicit
  // 24-hour clock. Inputs such as 5:30 remain genuinely ambiguous.
  const explicit24Hour = rawHour.length === 2 && rawHour.startsWith("0") || hour === 0 || hour > 12;
  if (!explicit24Hour) {
    return {
      hour,
      minute,
      clockLabel: `${hour}:${String(minute).padStart(2, "0")}`,
      ambiguous: true,
      valid: hour >= 1 && hour <= 12,
    };
  }
  return {
    hour,
    minute,
    clockLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    ambiguous: false,
    valid: hour >= 0 && hour <= 23,
  };
};

export const timeClarificationForRequest = (request: string) => {
  if (!/\b(?:message|tell|ask|send)\b/i.test(request)) return null;
  if (
    /\b(?:tomorrow\s+)?(?:morning|afternoon|evening|night)\b/i.test(request) &&
    !/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(request)
  ) {
    return "What exact time should I use? Please include AM or PM.";
  }
  const atClock = request.match(
    /\bat\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?/i,
  );
  if (!atClock) return null;
  const parsed = parseClock(atClock[0]);
  if (!parsed?.ambiguous) return null;
  return `Do you mean ${parsed.clockLabel} AM or PM?`;
};

export function resolveScheduleTime(input: {
  expression: string;
  now: string;
  timezone: string;
}): ScheduleResolution {
  const expression = input.expression.trim();
  const lower = expression.toLocaleLowerCase();
  const now = new Date(input.now);
  let timezone: string;
  try {
    timezone = canonicalizeTimeZone(input.timezone);
    partsInTimeZone(now, timezone);
  } catch {
    return { status: "clarification", reason: "invalid_timezone", message: "I could not validate your timezone. Please choose a valid city timezone." };
  }

  if (/\b(evening|morning|afternoon|night)\b/i.test(expression) && !/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(expression)) {
    return { status: "clarification", reason: "ambiguous_time", message: "What exact time should I use? Please include AM or PM." };
  }

  const relative = lower.match(/\bin\s+(\d{1,3})\s+minutes?\b/);
  if (relative) {
    const minutes = Number(relative[1]);
    if (minutes < 2) {
      return { status: "clarification", reason: "too_soon", message: "Scheduled messages need at least two minutes of lead time." };
    }
    const sendAt = new Date(now.getTime() + minutes * 60_000);
    return { status: "resolved", sendAt: sendAt.toISOString(), timezone, localLabel: localLabel(sendAt, timezone) };
  }

  const clock = parseClock(expression);
  if (!clock) {
    return { status: "clarification", reason: "missing_time", message: "What exact date and time should I use?" };
  }
  if (!clock.valid) {
    return { status: "clarification", reason: "invalid_time", message: "Please provide a valid time." };
  }
  if (clock.ambiguous) {
    return { status: "clarification", reason: "ambiguous_time", clockLabel: clock.clockLabel, message: `Do you mean ${clock.clockLabel} AM or PM?` };
  }

  const today = partsInTimeZone(now, timezone);
  const dayOffset = /\btomorrow\b/i.test(expression) ? 1 : 0;
  const target = addLocalDays({ ...today, hour: clock.hour, minute: clock.minute, second: 0 }, dayOffset);
  const sendAt = wallClockToUtc(target, timezone);
  if (sendAt.getTime() <= now.getTime()) {
    const tomorrowTarget = addLocalDays(target, 1);
    const tomorrowSendAt = wallClockToUtc(tomorrowTarget, timezone);
    return {
      status: "clarification",
      reason: "past_time",
      clockLabel: clock.clockLabel,
      tomorrowSendAt: tomorrowSendAt.toISOString(),
      timezone,
      message: `${clock.clockLabel} has already passed today. Do you want me to schedule it for tomorrow at ${clock.clockLabel}?`,
    };
  }
  if (sendAt.getTime() <= now.getTime() + 60_000) {
    return { status: "clarification", reason: "too_soon", clockLabel: clock.clockLabel, message: "That time is too close. Choose a time at least 1 minute from now." };
  }
  return { status: "resolved", sendAt: sendAt.toISOString(), timezone, localLabel: localLabel(sendAt, timezone) };
}
