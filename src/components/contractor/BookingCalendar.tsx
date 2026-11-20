import { useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, MapPin, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import {
  BOOKING_TYPES, BOOKING_TYPE_LABEL, addMinutes, bookingIcs, dateLabel, dayKey, monthGrid, overlaps, timeLabel, toIso,
  type Booking, type BookingType,
} from "@/lib/bookings";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useBookings } from "./useBookings";

export interface BookingLink { kind: "lead" | "permit" | "bid"; itemId: string }

/** A project or lead name can list many problems and be longer than a booking title may be, so the title uses the first part. */
const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n).replace(/[\s,;-]+\S*$/, "")}…` : s);

const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
const durationLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} hr`);

/**
 * A month calendar of the business's bookings. Every booking shows (so two jobs are not booked on top of each other), the ones for this
 * job are highlighted, and a new booking is added for the day picked. Used on an accepted lead and on a project.
 */
export function BookingCalendar({ listingId, link, projectId, defaults }: {
  listingId: string; link?: BookingLink; projectId?: string; defaults: { title: string; customer?: string | null; location?: string | null };
}) {
  const { rows, error, reload } = useBookings(true);
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState(dayKey(today));
  const [type, setType] = useState<BookingType>("site_visit");
  const [title, setTitle] = useState(`Site visit: ${short(defaults.title)}`);
  const [time, setTime] = useState("09:00");
  const [minutes, setMinutes] = useState(60);
  const [location, setLocation] = useState(defaults.location ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const live = useMemo(() => (rows ?? []).filter((b) => b.status !== "cancelled"), [rows]);
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of live) { const k = dayKey(new Date(b.starts_at)); m.set(k, [...(m.get(k) ?? []), b]); }
    return m;
  }, [live]);
  const mine = (b: Booking) => (projectId && b.project_id === projectId) || Boolean(link && b.lead_kind === link.kind && b.lead_item_id === link.itemId);
  const myRows = (rows ?? []).filter(mine);
  const dayRows = byDay.get(picked) ?? [];
  const startIso = picked && time ? toIso(picked, time) : "";
  const endIso = startIso ? addMinutes(startIso, minutes) : "";
  const clash = startIso ? live.find((b) => overlaps(b, { starts_at: startIso, ends_at: endIso })) : undefined;
  const grid = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const todayKey = dayKey(today);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!startIso || !title.trim()) return;
    setBusy(true);
    setMsg(null);
    const { error: err } = await getSupabaseBrowser().from("bookings").insert({
      listing_id: listingId, project_id: projectId ?? null, lead_kind: link?.kind ?? null, lead_item_id: link?.itemId ?? null,
      type, title: title.trim().slice(0, 200), starts_at: startIso, ends_at: endIso, customer_name: defaults.customer ?? null, location: location.trim() || null, notes: notes.trim() || null,
    });
    setBusy(false);
    if (err) return setMsg(err.message.includes("row-level") ? "That booking could not be saved for this lead." : err.message);
    setNotes("");
    setMsg(`Booked for ${dateLabel(startIso)} at ${timeLabel(startIso)}.`);
    await reload();
  }
  async function setStatus(id: string, status: "completed" | "cancelled") {
    const { error: err } = await getSupabaseBrowser().from("bookings").update({ status }).eq("id", id);
    if (err) setMsg(err.message); else await reload();
  }
  async function remove(id: string) {
    const { error: err } = await getSupabaseBrowser().from("bookings").delete().eq("id", id);
    if (err) setMsg(err.message); else await reload();
  }
  function download(b: Booking) {
    const url = URL.createObjectURL(new Blob([bookingIcs(b)], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${b.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "booking"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">{error}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month" className="rounded-lg p-1.5 hover:bg-slate-100"><ChevronLeft className="size-4" aria-hidden /></button>
          <p className="text-sm font-bold text-navy">{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month" className="rounded-lg p-1.5 hover:bg-slate-100"><ChevronRight className="size-4" aria-hidden /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const k = dayKey(d);
            const items = byDay.get(k) ?? [];
            const inMonth = d.getMonth() === cursor.getMonth();
            const has = items.some(mine);
            return (
              <button key={k} type="button" onClick={() => setPicked(k)} aria-pressed={picked === k} aria-label={`${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${items.length ? `, ${items.length} booked` : ""}`}
                className={`relative h-11 rounded-lg border text-sm ${picked === k ? "border-primary bg-blue-50 font-bold text-primary" : "border-transparent hover:bg-slate-50"} ${inMonth ? "text-slate-800" : "text-slate-300"} ${k === todayKey ? "ring-1 ring-slate-300" : ""}`}>
                {d.getDate()}
                {items.length > 0 && <span className={`absolute bottom-1 left-1/2 h-1.5 -translate-x-1/2 rounded-full ${has ? "w-4 bg-emerald-500" : "w-1.5 bg-slate-400"}`} aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex items-center gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-full bg-emerald-500" /> This job</span><span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Other bookings</span></p>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">{dateLabel(`${picked}T12:00`)}</p>
          {dayRows.length === 0 ? <p className="mt-1 text-sm text-slate-500">Nothing booked. This day is free.</p> : (
            <ul className="mt-1 space-y-1 text-sm">
              {dayRows.map((b) => <li key={b.id} className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${mine(b) ? "bg-emerald-50" : "bg-slate-50"}`}><span className="truncate">{b.title}</span><span className="shrink-0 text-xs text-slate-600">{timeLabel(b.starts_at)} to {timeLabel(b.ends_at)}</span></li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <form onSubmit={add} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-navy"><CalendarPlus className="size-4 text-primary" aria-hidden /> Book {dateLabel(`${picked}T12:00`)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">Type
              <select value={type} onChange={(e) => { const t = e.target.value as BookingType; setType(t); setTitle(`${BOOKING_TYPE_LABEL[t]}: ${short(defaults.title)}`); }} className={`${inputClass} mt-1 !py-1.5`}>
                {BOOKING_TYPES.map((t) => <option key={t} value={t}>{BOOKING_TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Start time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className={`${inputClass} mt-1 !py-1.5`} />
            </label>
            <label className="text-xs font-semibold text-slate-600">How long
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${inputClass} mt-1 !py-1.5`}>{DURATIONS.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}</select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Where
              <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} placeholder="Address" className={`${inputClass} mt-1 !py-1.5`} />
            </label>
            <label className="col-span-2 text-xs font-semibold text-slate-600">Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required className={`${inputClass} mt-1 !py-1.5`} />
            </label>
            <label className="col-span-2 text-xs font-semibold text-slate-600">Notes <span className="font-normal text-slate-500">(optional)</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Gate code, what to bring…" className={`${inputClass} mt-1 !py-1.5`} />
            </label>
          </div>
          {clash && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">This overlaps &ldquo;{clash.title}&rdquo; ({timeLabel(clash.starts_at)} to {timeLabel(clash.ends_at)}). You can still book it.</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || !title.trim()} className="!rounded-full !px-5 !py-2 text-sm">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Add booking</Button>
            <span role="status" className="text-xs font-medium text-slate-700">{msg}</span>
          </div>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-bold text-navy">Bookings for this job</p>
          {rows === null ? <p className="mt-1 text-sm text-slate-500">Loading…</p> : myRows.length === 0 ? <p className="mt-1 text-sm text-slate-500">None yet. Pick a day and add one.</p> : (
            <ul className="mt-2 space-y-2">
              {myRows.map((b) => (
                <li key={b.id} className={`rounded-lg border p-2 text-sm ${b.status === "cancelled" ? "border-slate-200 bg-slate-50 text-slate-500" : "border-emerald-200 bg-emerald-50/50"}`}>
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`font-semibold ${b.status === "cancelled" ? "line-through" : "text-navy"}`}>{b.title}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">{b.status === "scheduled" ? BOOKING_TYPE_LABEL[b.type] : b.status}</span>
                  </p>
                  <p className="text-xs text-slate-600">{dateLabel(b.starts_at)}, {timeLabel(b.starts_at)} to {timeLabel(b.ends_at)}</p>
                  {b.location && <p className="flex items-center gap-1 text-xs text-slate-600"><MapPin className="size-3" aria-hidden /> {b.location}</p>}
                  <p className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
                    {b.status === "scheduled" && <button type="button" onClick={() => void setStatus(b.id, "completed")} className="inline-flex items-center gap-1 text-emerald-700 hover:underline"><CheckCircle2 className="size-3.5" aria-hidden /> Done</button>}
                    {b.status === "scheduled" && <button type="button" onClick={() => void setStatus(b.id, "cancelled")} className="inline-flex items-center gap-1 text-slate-600 hover:underline"><XCircle className="size-3.5" aria-hidden /> Cancel</button>}
                    <button type="button" onClick={() => download(b)} className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="size-3.5" aria-hidden /> Add to my calendar</button>
                    <button type="button" onClick={() => void remove(b.id)} className="inline-flex items-center gap-1 text-red-700 hover:underline"><Trash2 className="size-3.5" aria-hidden /> Delete</button>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
