import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Crown, Eye, Globe, Lightbulb, Mail, Minus, MousePointerClick, Navigation, Phone, Smartphone, Users } from "lucide-react";
import { PageTitle } from "@/components/admin/widgets";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useContractor } from "./context";
import { PerformancePanel } from "./PerformancePanel";

interface Day { day: string; impressions: number; views: number; actions: number }
interface Analytics {
  days: number;
  featured_now: boolean;
  totals: { impressions: number; featured_impressions: number; views: number; visitors: number; calls: number; emails: number; websites: number; directions: number };
  before: { impressions: number; views: number; visitors: number; actions: number };
  daily: Day[];
  devices: Record<string, number>;
  sources: { name: string; count: number }[];
  placements: Record<string, number>;
  leads: { received: number; received_before: number };
}

const RANGES = [7, 30, 90] as const;
const n = (v: number) => v.toLocaleString("en-US");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "–");
const PLACE_LABEL: Record<string, string> = { directory: "Directory search", city: "City pages", home: "Home page", similar: "Similar businesses", listing: "Your listing page", other: "Other pages" };
const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-slate-400"><Minus className="size-3" aria-hidden /> No change</span>;
  if (before === 0) return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700"><ArrowUpRight className="size-3" aria-hidden /> New</span>;
  const d = Math.round(((now - before) / before) * 100);
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-slate-500"><Minus className="size-3" aria-hidden /> Same as before</span>;
  return d > 0
    ? <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700"><ArrowUpRight className="size-3" aria-hidden /> {d}%</span>
    : <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-700"><ArrowDownRight className="size-3" aria-hidden /> {Math.abs(d)}%</span>;
}

function Kpi({ icon, label, value, hint, delta, tone = "border-slate-200 bg-white" }: { icon: ReactNode; label: string; value: ReactNode; hint?: string; delta?: ReactNode; tone?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><span className="text-slate-400" aria-hidden>{icon}</span>{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-navy tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">{delta}{hint && <span>{hint}</span>}</p>
    </div>
  );
}

function Card({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-navy">{title}</h2>{aside && <div className="text-xs text-slate-500">{aside}</div>}</div>
      {children}
    </section>
  );
}

/** A row with a label, a bar scaled to the biggest row, and the count. */
function Bars({ rows, tone = "bg-primary" }: { rows: { label: ReactNode; value: number }[]; tone?: string }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 truncate text-slate-700">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${(r.value / top) * 100}%` }} /></span>
          <span className="text-right font-semibold text-navy tabular-nums">{n(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

const SERIES = [
  { key: "impressions", label: "Shown in lists", stroke: "#94a3b8", fill: "rgba(148,163,184,0.15)" },
  { key: "views", label: "Listing views", stroke: "#2563eb", fill: "rgba(37,99,235,0.14)" },
  { key: "actions", label: "Contact actions", stroke: "#059669", fill: "rgba(5,150,105,0.14)" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

/** Daily lines for the chosen series, with a read-out that follows the pointer. The same numbers are in a table for screen readers. */
function Trend({ daily }: { daily: Day[] }) {
  const [on, setOn] = useState<Record<SeriesKey, boolean>>({ impressions: true, views: true, actions: true });
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, PAD = { l: 34, r: 10, t: 12, b: 24 };
  const shown = SERIES.filter((s) => on[s.key]);
  const top = Math.max(4, ...daily.flatMap((d) => shown.map((s) => d[s.key])));
  const niceTop = Math.ceil(top / 4) * 4;
  const x = (i: number) => PAD.l + (daily.length <= 1 ? 0 : (i / (daily.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / niceTop) * (H - PAD.t - PAD.b);
  const path = (k: SeriesKey) => daily.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const area = (k: SeriesKey) => `${path(k)} L${x(daily.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceTop * f));
  const labelAt = [0, Math.floor((daily.length - 1) / 2), daily.length - 1];
  const hd = hover !== null ? daily[hover] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {SERIES.map((s) => (
          <button key={s.key} type="button" aria-pressed={on[s.key]} onClick={() => setOn({ ...on, [s.key]: !on[s.key] })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${on[s.key] ? "border-slate-300 bg-white text-navy" : "border-transparent bg-slate-100 text-slate-400"}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: on[s.key] ? s.stroke : "#cbd5e1" }} aria-hidden /> {s.label}
          </button>
        ))}
        <span className="ml-auto min-h-5 text-xs text-slate-600" aria-hidden>
          {hd ? <><strong className="text-navy">{shortDay(hd.day)}</strong>{shown.map((s) => ` · ${s.label} ${hd[s.key]}`)}</> : "Point at the chart for a day"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-pan-y" role="img" aria-label="Daily listing activity"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(daily.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (daily.length - 1))))); }}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" /><text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{t}</text></g>
        ))}
        {shown.map((s) => <path key={`a${s.key}`} d={area(s.key)} fill={s.fill} />)}
        {shown.map((s) => <path key={s.key} d={path(s.key)} fill="none" stroke={s.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {labelAt.map((i, k) => daily[i] && <text key={i} x={x(i)} y={H - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} fontSize="11" fill="#64748b">{shortDay(daily[i].day)}</text>)}
        {hover !== null && (
          <g><line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="3 3" />{shown.map((s) => <circle key={s.key} cx={x(hover)} cy={y(daily[hover][s.key])} r="4" fill="#fff" stroke={s.stroke} strokeWidth="2" />)}</g>
        )}
      </svg>
      <table className="sr-only"><caption>Daily listing activity</caption><thead><tr><th>Day</th>{SERIES.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{daily.map((d) => <tr key={d.day}><td>{d.day}</td>{SERIES.map((s) => <td key={s.key}>{d[s.key]}</td>)}</tr>)}</tbody></table>
    </div>
  );
}

/** What the numbers suggest, in plain words. */
function insights(a: Analytics, hasWebsite: boolean): { text: ReactNode; tone: string }[] {
  const t = a.totals;
  const actions = t.calls + t.emails + t.websites + t.directions;
  const out: { text: ReactNode; tone: string }[] = [];
  if (!a.featured_now) out.push({ tone: "border-amber-200 bg-amber-50", text: <>Your listing is on the free plan. Featured listings are marked and shown first, so more visitors see them. <Link to="/contractor/billing" className="font-semibold underline">See plans</Link></> });
  if (t.impressions + t.views === 0) out.push({ tone: "border-slate-200 bg-slate-50", text: "No visitors have been counted yet. Numbers start as soon as someone sees your listing in the directory or opens it. Visits from your own sign-in are never counted." });
  if (t.views >= 10 && actions / t.views < 0.05) out.push({ tone: "border-blue-200 bg-blue-50", text: <>Visitors open your listing but few get in touch ({pct(actions, t.views)}). A clear description, your services, photos and opening hours help. <Link to="/contractor/business" className="font-semibold underline">Improve your profile</Link></> });
  if (t.impressions >= 20 && t.views / t.impressions < 0.05) out.push({ tone: "border-blue-200 bg-blue-50", text: "Your listing is shown often but rarely opened. A profile picture, a Google rating and a Verified badge make it stand out in the list." });
  if (t.views >= 5 && !hasWebsite) out.push({ tone: "border-blue-200 bg-blue-50", text: "You have no website on your listing, so visitors cannot go from here to your site. Add one in your company profile." });
  if (t.websites + t.calls > 0 && t.emails === 0 && t.views >= 10) out.push({ tone: "border-slate-200 bg-slate-50", text: "Visitors call or visit your site but no one emails. That is normal for urgent repairs; make sure your phone is answered quickly." });
  if (a.before.views > 0 && t.views >= a.before.views * 1.2) out.push({ tone: "border-emerald-200 bg-emerald-50", text: "More people opened your listing than in the period before. Keep your hours and phone number up to date while it is busy." });
  return out;
}

/** How the business listing is doing: who saw it, who opened it and what they did next. */
export default function ContractorAnalytics() {
  const { listing } = useContractor();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const q = useLiveQuery<Analytics | null>(null, () => getSupabaseBrowser().rpc("my_listing_analytics", { p_days: days }), { key: `listing-analytics-${days}`, intervalMs: 60_000 });
  const a = q.data;
  const tips = useMemo(() => (a ? insights(a, Boolean(listing?.website)) : []), [a, listing?.website]);

  const head = (
    <PageTitle title="Analytics" description="Who saw your company listing, who opened it and what they did next.">
      <div role="group" aria-label="Time range" className="inline-flex rounded-full border border-slate-300 bg-white p-0.5">
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)} className={`rounded-full px-3.5 py-1 text-sm font-semibold ${days === r ? "bg-primary text-white" : "text-slate-600 hover:text-navy"}`}>{r} days</button>
        ))}
      </div>
    </PageTitle>
  );

  if (q.error && !a) {
    return (
      <>
        {head}
        <p className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">Analytics could not be loaded. Run <code>supabase/schema-analytics.sql</code> in the Supabase SQL Editor, then reload. Your business must also be connected on the dashboard.</p>
        <div className="mt-6"><PerformancePanel /></div>
      </>
    );
  }
  if (!a) return <>{head}<p className="text-slate-600">Loading…</p></>;

  const t = a.totals;
  const actions = t.calls + t.emails + t.websites + t.directions;
  const dev = a.devices;
  const devTotal = (dev.desktop ?? 0) + (dev.mobile ?? 0) + (dev.tablet ?? 0);
  const funnel = [
    { label: "Shown in lists", value: t.impressions, tone: "bg-slate-400" },
    { label: "Opened your listing", value: t.views, tone: "bg-blue-500" },
    { label: "Called, emailed or visited", value: actions, tone: "bg-emerald-500" },
    { label: "Customer requests", value: a.leads.received, tone: "bg-amber-500" },
  ];
  const top = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <>
      {head}

      {a.featured_now ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"><Crown className="size-4" aria-hidden /> <strong>Featured listing.</strong> {n(t.featured_impressions)} of your {n(t.impressions)} appearances in the last {a.days} days were as a featured business.</p>
      ) : (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700"><Crown className="size-4 text-slate-400" aria-hidden /> Your listing is on the free plan. <Link to="/contractor/billing" className="font-semibold text-primary underline">Go Featured</Link> to be marked and shown first.</p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Eye className="size-3.5" />} label="Shown in lists" value={n(t.impressions)} delta={<Delta now={t.impressions} before={a.before.impressions} />} />
        <Kpi icon={<MousePointerClick className="size-3.5" />} label="Listing views" value={n(t.views)} delta={<Delta now={t.views} before={a.before.views} />} tone="border-blue-200 bg-blue-50/60" />
        <Kpi icon={<Users className="size-3.5" />} label="Visitors" value={n(t.visitors)} hint="different browsers" delta={<Delta now={t.visitors} before={a.before.visitors} />} />
        <Kpi icon={<Phone className="size-3.5" />} label="Contact actions" value={n(actions)} delta={<Delta now={actions} before={a.before.actions} />} tone="border-emerald-200 bg-emerald-50/60" />
        <Kpi icon={<Mail className="size-3.5" />} label="Customer requests" value={n(a.leads.received)} delta={<Delta now={a.leads.received} before={a.leads.received_before} />} />
        <Kpi icon={<Lightbulb className="size-3.5" />} label="Get in touch rate" value={pct(actions, t.views)} hint="of views" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Activity by day" aside={`Last ${a.days} days`}><Trend daily={a.daily} /></Card>
        <Card title="From seeing you to calling you">
          <ul className="space-y-3" aria-label="Funnel">
            {funnel.map((f, i) => (
              <li key={f.label}>
                <div className="flex items-baseline justify-between text-sm"><span className="text-slate-700">{f.label}</span><span className="font-bold text-navy tabular-nums">{n(f.value)}</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${f.tone}`} style={{ width: `${(f.value / top) * 100}%` }} /></div>
                {i > 0 && <p className="mt-0.5 text-[11px] text-slate-500">{pct(f.value, funnel[i - 1].value)} of the step above</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="What visitors did">
          <Bars tone="bg-emerald-500" rows={[
            { label: <><Phone className="size-3.5 text-slate-400" aria-hidden /> Called</>, value: t.calls },
            { label: <><Globe className="size-3.5 text-slate-400" aria-hidden /> Website</>, value: t.websites },
            { label: <><Mail className="size-3.5 text-slate-400" aria-hidden /> Emailed</>, value: t.emails },
            { label: <><Navigation className="size-3.5 text-slate-400" aria-hidden /> Directions</>, value: t.directions },
          ]} />
        </Card>
        <Card title="Where you were seen">
          {Object.keys(a.placements).length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
            <Bars tone="bg-slate-500" rows={Object.entries(a.placements).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: PLACE_LABEL[k] ?? k, value: v }))} />
          )}
        </Card>
        <Card title="How they found you">
          {a.sources.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : <Bars tone="bg-blue-500" rows={a.sources.map((s) => ({ label: s.name, value: s.count }))} />}
        </Card>
        <Card title="Devices" aside={<Smartphone className="size-4 text-slate-400" aria-hidden />}>
          {devTotal === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Share of views by device">
                {(["mobile", "desktop", "tablet"] as const).map((k, i) => (dev[k] ?? 0) > 0 && <span key={k} className={["bg-blue-500", "bg-slate-500", "bg-amber-400"][i]} style={{ width: `${((dev[k] ?? 0) / devTotal) * 100}%` }} />)}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {(["mobile", "desktop", "tablet"] as const).map((k, i) => <li key={k} className="flex items-center justify-between"><span className="flex items-center gap-2 capitalize text-slate-700"><span className={`size-2.5 rounded-full ${["bg-blue-500", "bg-slate-500", "bg-amber-400"][i]}`} aria-hidden />{k}</span><span className="font-semibold text-navy tabular-nums">{pct(dev[k] ?? 0, devTotal)}</span></li>)}
              </ul>
            </>
          )}
        </Card>
      </div>

      {tips.length > 0 && (
        <section className="mt-4" aria-label="What to do next">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy"><Lightbulb className="size-4 text-amber-500" aria-hidden /> What to do next</h2>
          <ul className="grid gap-2 md:grid-cols-2">{tips.map((tip, i) => <li key={i} className={`rounded-xl border px-4 py-3 text-sm text-slate-800 ${tip.tone}`}>{tip.text}</li>)}</ul>
        </section>
      )}

      <div className="mt-6"><PerformancePanel /></div>
      <p className="mt-4 text-xs text-slate-500">Counts are anonymous: a random browser id, the device type and the site a visitor came from. A refresh does not count twice, you and your team signed in do not count, and visitors who send Do Not Track are not counted. Updated every minute.</p>
    </>
  );
}
