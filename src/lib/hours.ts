import type { BusinessHours, DayKey } from "@/lib/types";

export const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** 24-hour "17:30" as "5:30 PM". */
export function formatTime(t: string): string {
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

/** Keeps only valid days (open before close). Returns null when nothing is open, so an empty form stores nothing. */
export function cleanHours(input: BusinessHours | null | undefined): BusinessHours | null {
  if (!input) return null;
  const out: BusinessHours = {};
  let any = false;
  for (const { key } of DAYS) {
    const d = input[key];
    if (d && TIME.test(d.open) && TIME.test(d.close) && minutes(d.open) < minutes(d.close)) {
      out[key] = { open: d.open, close: d.close };
      any = true;
    } else {
      out[key] = null;
    }
  }
  return any ? out : null;
}

export const hasHours = (h: BusinessHours | null | undefined) => Boolean(cleanHours(h));

// Main time zone of each state (a few states are split; the larger part is used).
const ZONES: Record<string, string[]> = {
  "America/New_York": ["Connecticut", "Delaware", "Florida", "Georgia", "Maine", "Maryland", "Massachusetts", "Michigan", "New Hampshire", "New Jersey", "New York", "North Carolina", "Ohio", "Pennsylvania", "Rhode Island", "South Carolina", "Vermont", "Virginia", "West Virginia", "Indiana", "Kentucky"],
  "America/Chicago": ["Alabama", "Arkansas", "Illinois", "Iowa", "Louisiana", "Minnesota", "Mississippi", "Missouri", "Oklahoma", "Texas", "Wisconsin", "Kansas", "Nebraska", "North Dakota", "South Dakota", "Tennessee"],
  "America/Denver": ["Colorado", "Montana", "New Mexico", "Utah", "Wyoming", "Idaho"],
  "America/Phoenix": ["Arizona"],
  "America/Los_Angeles": ["California", "Nevada", "Oregon", "Washington"],
};
const ZONE_OF = new Map(Object.entries(ZONES).flatMap(([zone, states]) => states.map((s) => [s.toLowerCase(), zone] as const)));

export const timeZoneFor = (state: string | null | undefined): string | null => ZONE_OF.get((state ?? "").trim().toLowerCase()) ?? null;

/** Day and minutes-since-midnight right now in a time zone. */
function localNow(now: Date, timeZone: string): { day: number; mins: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
    if (day < 0) return null;
    return { day, mins: Number(get("hour")) * 60 + Number(get("minute")) };
  } catch {
    return null;
  }
}

/** "Open now · closes 5:00 PM" or "Closed · opens Mon 8:00 AM". Null when the hours or the time zone are unknown. */
export function openStatus(hours: BusinessHours | null | undefined, state: string | null | undefined, now = new Date()): { open: boolean; text: string } | null {
  const h = cleanHours(hours);
  const zone = timeZoneFor(state);
  if (!h || !zone) return null;
  const local = localNow(now, zone);
  if (!local) return null;
  const today = h[DAYS[local.day].key];
  if (today && local.mins >= minutes(today.open) && local.mins < minutes(today.close)) return { open: true, text: `Open now · closes ${formatTime(today.close)}` };
  if (today && local.mins < minutes(today.open)) return { open: false, text: `Closed · opens ${formatTime(today.open)}` };
  for (let i = 1; i <= 7; i++) {
    const idx = (local.day + i) % 7;
    const d = h[DAYS[idx].key];
    if (d) return { open: false, text: `Closed · opens ${i === 1 ? "tomorrow" : DAYS[idx].short} ${formatTime(d.open)}` };
  }
  return null;
}
