import type {
  Opening,
  TimeOfDay,
  WaitlistClient,
  Weekday,
} from "./types";

// Pure, deterministic helpers, safe to use inside Workflow code.

const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayOf(startsAt: string): Weekday {
  const [year, month, day] = startsAt.slice(0, 10).split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function timeOfDayOf(startsAt: string): TimeOfDay {
  const hour = Number(startsAt.slice(11, 13));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

// Returns null when the client fits the opening, or the reason they do not.
export function ineligibilityReason(
  client: WaitlistClient,
  opening: Opening,
): string | null {
  if (client.service !== opening.service) {
    return `wants ${client.service}, opening is ${opening.service}`;
  }
  if (
    client.stylistPreference !== "Any" &&
    client.stylistPreference !== opening.stylist
  ) {
    return `prefers ${client.stylistPreference}, opening is with ${opening.stylist}`;
  }
  const day = weekdayOf(opening.startsAt);
  if (!client.availableDays.includes(day)) {
    return `not available on ${day}`;
  }
  const time = timeOfDayOf(opening.startsAt);
  if (!client.availableTimes.includes(time)) {
    return `not available in the ${time}`;
  }
  return null;
}

// Eligible clients, earliest waitlist sign-up first.
export function rankCandidates(
  waitlist: WaitlistClient[],
  opening: Opening,
): {
  eligible: WaitlistClient[];
  ineligible: { client: WaitlistClient; reason: string }[];
} {
  const eligible: WaitlistClient[] = [];
  const ineligible: { client: WaitlistClient; reason: string }[] = [];
  for (const client of waitlist) {
    const reason = ineligibilityReason(client, opening);
    if (reason) ineligible.push({ client, reason });
    else eligible.push(client);
  }
  eligible.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  return { eligible, ineligible };
}

export function describeOpening(opening: Opening): string {
  const day = weekdayOf(opening.startsAt);
  const date = opening.startsAt.slice(5, 10).replace("-", "/");
  const [hour, minute] = opening.startsAt.slice(11, 16).split(":").map(Number);
  const clock = `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  return `${opening.service} with ${opening.stylist}, ${day} ${date} at ${clock}`;
}
