import { useId, useState } from "react";

export interface Series { key: string; label: string; color: string; values: number[] }

const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const CSS = `
@keyframes ml-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
@keyframes ml-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ml-pulse { 0% { r: 4; opacity: .55 } 100% { r: 13; opacity: 0 } }
.ml-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ml-draw 1.4s cubic-bezier(.4,0,.2,1) forwards }
.ml-area { opacity: 0; animation: ml-fade .9s ease-out .7s forwards }
.ml-end { opacity: 0; animation: ml-fade .4s ease-out 1.3s forwards }
.ml-ring { animation: ml-pulse 2.2s ease-out 1.5s infinite }
@media (prefers-reduced-motion: reduce) { .ml-line, .ml-area, .ml-end { animation: none; stroke-dashoffset: 0; opacity: 1 } .ml-ring { animation: none; opacity: 0 } }
`;

/** A smooth line through the points. Control points are held between neighbours so the curve never dips below zero or overshoots a peak. */
function smooth(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const cx = (x1 - x0) / 2.6;
    d += ` C${(x0 + cx).toFixed(1)},${y0.toFixed(1)} ${(x1 - cx).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/**
 * Daily smooth lines with soft filled areas for a few series on one chart. The lines draw in when the chart appears or the period changes.
 * Each series can be switched off, and pointing at a day opens a card with every value. The same numbers are in a table for screen readers.
 */
export function MultiLine({ dates, series, height = 280 }: { dates: string[]; series: Series[]; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = height, PAD = { l: 36, r: 14, t: 16, b: 28 };
  const shown = series.filter((s) => !off.has(s.key));
  const top = Math.max(4, ...shown.flatMap((s) => s.values));
  const unit = top <= 8 ? 2 : top <= 20 ? 4 : Math.pow(10, Math.floor(Math.log10(top))) / 2;
  const niceTop = Math.ceil(top / (unit * 4)) * unit * 4;
  const x = (i: number) => PAD.l + (dates.length <= 1 ? 0 : (i / (dates.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / niceTop) * (H - PAD.t - PAD.b);
  const pts = (s: Series): [number, number][] => s.values.map((v, i) => [x(i), y(v)]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceTop * f));
  const labelAt = dates.length > 10 ? [0, Math.round((dates.length - 1) / 3), Math.round(((dates.length - 1) * 2) / 3), dates.length - 1] : dates.map((_, i) => i);
  const base = H - PAD.b;
  const replay = `${dates.length}-${dates[0] ?? ""}`;
  const tipLeft = hover === null ? 0 : (x(hover) / W) * 100;
  return (
    <div>
      <style>{CSS}</style>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {series.map((s) => {
          const total = s.values.reduce((a, b) => a + b, 0);
          return (
            <button key={s.key} type="button" aria-pressed={!off.has(s.key)} onClick={() => setOff((o) => { const n = new Set(o); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition ${off.has(s.key) ? "border-transparent bg-slate-100 text-slate-400" : "border-slate-200 bg-white text-navy shadow-sm hover:border-slate-300"}`}>
              <span className="size-2.5 rounded-full" style={{ background: off.has(s.key) ? "#cbd5e1" : s.color }} aria-hidden />
              <span className="text-xs font-semibold">{s.label}</span>
              <span className="text-sm font-extrabold tabular-nums">{total.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-pan-y select-none" role="img" aria-label="Daily activity"
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(dates.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (dates.length - 1))))); }}
          onPointerLeave={() => setHover(null)}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray={t === 0 ? undefined : "3 5"} /><text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{t}</text></g>)}
          {shown.map((s) => {
            const p = pts(s);
            const line = smooth(p);
            const last = p[p.length - 1];
            return (
              <g key={`${s.key}-${replay}`}>
                <path className="ml-area" d={`${line} L${x(dates.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`} fill={`url(#${uid}-${s.key})`} />
                <path className="ml-line" pathLength={1} d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {last && <g className="ml-end"><circle className="ml-ring" cx={last[0]} cy={last[1]} r="4" fill={s.color} /><circle cx={last[0]} cy={last[1]} r="4" fill="#fff" stroke={s.color} strokeWidth="2.5" /></g>}
              </g>
            );
          })}
          {labelAt.map((i, k) => dates[i] && <text key={i} x={x(i)} y={H - 8} textAnchor={k === 0 ? "start" : k === labelAt.length - 1 ? "end" : "middle"} fontSize="11" fill="#94a3b8">{short(dates[i])}</text>)}
          {hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={base} stroke="#94a3b8" strokeDasharray="3 3" />{shown.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="5" fill="#fff" stroke={s.color} strokeWidth="2.5" />)}</g>}
        </svg>
        {hover !== null && (
          <div aria-hidden className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur" style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 70 ? "-110%" : "10%"})` }}>
            <p className="mb-1 font-bold text-navy">{short(dates[hover])}</p>
            {shown.map((s) => <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span><strong className="tabular-nums text-navy">{s.values[hover]}</strong></p>)}
          </div>
        )}
      </div>
      <table className="sr-only"><caption>Daily activity</caption><thead><tr><th>Day</th>{series.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
        <tbody>{dates.map((d, i) => <tr key={d}><td>{d}</td>{series.map((s) => <td key={s.key}>{s.values[i]}</td>)}</tr>)}</tbody></table>
    </div>
  );
}

/** A horizontal stacked bar with a legend, for a few parts of a whole. */
export function Stack({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <p className="text-sm text-slate-500">Nothing yet.</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {parts.map((p) => <li key={p.label} className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-700"><span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />{p.label}</span><span className="font-semibold text-navy tabular-nums">{p.value}</span></li>)}
      </ul>
    </div>
  );
}
