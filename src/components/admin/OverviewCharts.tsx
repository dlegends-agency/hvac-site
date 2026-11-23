import { useState } from "react";

export interface Series { key: string; label: string; color: string; values: number[] }

const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Daily lines for a few series on one chart. Each series can be switched off, and pointing at a day reads out every value.
 * The same numbers are in a table for screen readers.
 */
export function MultiLine({ dates, series, height = 230 }: { dates: string[]; series: Series[]; height?: number }) {
  const [off, setOff] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = height, PAD = { l: 34, r: 10, t: 12, b: 24 };
  const shown = series.filter((s) => !off.has(s.key));
  const top = Math.max(4, ...shown.flatMap((s) => s.values));
  const niceTop = Math.ceil(top / 4) * 4;
  const x = (i: number) => PAD.l + (dates.length <= 1 ? 0 : (i / (dates.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - v / niceTop) * (H - PAD.t - PAD.b);
  const path = (s: Series) => s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceTop * f));
  const labelAt = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {series.map((s) => (
          <button key={s.key} type="button" aria-pressed={!off.has(s.key)} onClick={() => setOff((o) => { const n = new Set(o); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${off.has(s.key) ? "border-transparent bg-slate-100 text-slate-400" : "border-slate-300 bg-white text-navy"}`}>
            <span className="size-2 rounded-full" style={{ background: off.has(s.key) ? "#cbd5e1" : s.color }} aria-hidden /> {s.label}
          </button>
        ))}
        <span className="ml-auto min-h-5 text-xs text-slate-600" aria-hidden>
          {hover !== null ? <><strong className="text-navy">{short(dates[hover])}</strong>{shown.map((s) => ` · ${s.label} ${s.values[hover]}`)}</> : "Point at the chart for a day"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-pan-y" role="img" aria-label="Daily activity"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(dates.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (dates.length - 1))))); }}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" /><text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{t}</text></g>)}
        {shown.map((s) => <path key={s.key} d={path(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {labelAt.map((i, k) => dates[i] && <text key={i} x={x(i)} y={H - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} fontSize="11" fill="#64748b">{short(dates[i])}</text>)}
        {hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="3 3" />{shown.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="4" fill="#fff" stroke={s.color} strokeWidth="2" />)}</g>}
      </svg>
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
