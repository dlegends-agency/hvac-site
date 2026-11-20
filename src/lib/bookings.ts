/** Bookings: site visits, estimates and jobs on the business's calendar. See supabase/schema-bookings.sql. */
export const BOOKING_TYPES = ["site_visit", "estimate", "installation", "service", "inspection", "meeting", "other"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];
export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  site_visit: "Site visit", estimate: "Estimate", installation: "Installation", service: "Service call", inspection: "Inspection", meeting: "Meeting", other: "Other",
};
export type BookingStatus = "scheduled" | "completed" | "cancelled";

export interface Booking {
  id: string; listing_id: string; project_id: string | null; lead_kind: "lead" | "permit" | "bid" | null; lead_item_id: string | null;
  type: BookingType; title: string; starts_at: string; ends_at: string; customer_name: string | null; location: string | null; notes: string | null;
  status: BookingStatus; created_at: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** YYYY-MM-DD in the browser's own time zone. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A date (YYYY-MM-DD) and a time (HH:MM) typed in the browser's time zone, as an ISO instant. */
export const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();
export const addMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

/** The 6 weeks (Sunday first) that make up a month grid. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** Two bookings overlap when each starts before the other ends. Cancelled ones never count. */
export const overlaps = (a: { starts_at: string; ends_at: string }, b: { starts_at: string; ends_at: string }) =>
  Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** An .ics calendar file for one booking, so it can go into Google, Apple or Outlook calendar. */
export function bookingIcs(b: Booking): string {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HVACHelp//Bookings//EN", "BEGIN:VEVENT",
    `UID:${b.id}@hvachelp`, `DTSTAMP:${icsTime(new Date().toISOString())}`, `DTSTART:${icsTime(b.starts_at)}`, `DTEND:${icsTime(b.ends_at)}`,
    `SUMMARY:${icsText(b.title)}`, b.location ? `LOCATION:${icsText(b.location)}` : "", b.notes ? `DESCRIPTION:${icsText(b.notes)}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
