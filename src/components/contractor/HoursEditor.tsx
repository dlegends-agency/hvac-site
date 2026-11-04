import { DAYS } from "@/lib/hours";
import type { BusinessHours, DayKey } from "@/lib/types";
import { inputClass } from "@/components/ui/Field";

const DEFAULT = { open: "08:00", close: "17:00" };

/** Opening hours for the week: tick the days the business is open and set the times. */
export function HoursEditor({ value, onChange }: { value: BusinessHours; onChange: (next: BusinessHours) => void }) {
  const set = (key: DayKey, day: { open: string; close: string } | null) => onChange({ ...value, [key]: day });
  const copyMonday = () => {
    const mon = value.mon;
    if (!mon) return;
    onChange({ ...value, tue: { ...mon }, wed: { ...mon }, thu: { ...mon }, fri: { ...mon } });
  };
  return (
    <div>
      <ul className="space-y-2">
        {DAYS.map((d) => {
          const day = value[d.key];
          return (
            <li key={d.key} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 sm:grid-cols-[8rem_7rem_1fr]">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-navy">
                <input type="checkbox" checked={Boolean(day)} onChange={(e) => set(d.key, e.target.checked ? { ...DEFAULT } : null)} className="size-4 accent-primary" />
                {d.label}
              </label>
              {day ? (
                <div className="col-span-1 flex items-center gap-2 sm:col-span-2">
                  <input type="time" aria-label={`${d.label} opens`} value={day.open} onChange={(e) => set(d.key, { ...day, open: e.target.value })} className={`${inputClass} !py-2`} />
                  <span className="text-slate-500" aria-hidden>to</span>
                  <input type="time" aria-label={`${d.label} closes`} value={day.close} onChange={(e) => set(d.key, { ...day, close: e.target.value })} className={`${inputClass} !py-2`} />
                </div>
              ) : (
                <span className="text-sm text-slate-500 sm:col-span-2">Closed</span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={copyMonday} disabled={!value.mon} className="mt-3 text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">
        Copy Monday&apos;s hours to Tuesday through Friday
      </button>
    </div>
  );
}
