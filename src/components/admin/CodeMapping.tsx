import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { useLiveQuery } from "@/lib/admin-hooks";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Panel } from "./widgets";

interface MapRow { id: number; naics: string; nigp_class: string; nigp_item: string | null; weight: number; note: string | null }

/** Same rule the sync uses: a 6-digit NAICS matches itself, a shorter one matches every code that starts with it. */
const covers = (rows: MapRow[], naics: string) => rows.some((m) => naics === m.naics || (m.naics.length < 6 && naics.startsWith(m.naics)));

/**
 * Admin > Directory > Government vendors: the reusable NAICS -> NIGP code table the sync converts with (one NAICS can map to several NIGP
 * codes), plus the NAICS codes found on open bids that have no mapping yet, so a new kind of bid can be taught once and matched from then on.
 */
export function CodeMapping() {
  const supabase = getSupabaseBrowser();
  const map = useLiveQuery<MapRow[]>([], () => supabase.from("naics_nigp_map").select("*").order("naics").order("weight", { ascending: false }).limit(1000), { key: "naics-map", intervalMs: null });
  const bidCodes = useLiveQuery<{ naics: string; n: number }[]>([], async () => {
    const counts = new Map<string, number>();
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase.from("gov_bids").select("naics").not("naics", "is", null).range(from, from + 999);
      if (error) return { data: null, error };
      for (const r of data as { naics: string }[]) counts.set(r.naics, (counts.get(r.naics) ?? 0) + 1);
      if (data.length < 1000) break;
    }
    return { data: [...counts].map(([naics, n]) => ({ naics, n })).sort((a, b) => b.n - a.n), error: null };
  }, { key: "bid-naics", intervalMs: 300_000 });

  const unmapped = useMemo(() => bidCodes.data.filter((c) => !covers(map.data, c.naics)), [bidCodes.data, map.data]);
  const [form, setForm] = useState({ naics: "", nigp_class: "", nigp_item: "", weight: "70", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.from("naics_nigp_map").insert({ naics: form.naics.trim(), nigp_class: form.nigp_class.trim(), nigp_item: form.nigp_item.trim() || null, weight: Number(form.weight), note: form.note.trim() || null });
    if (error) return setMsg({ ok: false, text: error.code === "23505" ? "That mapping already exists." : "Not saved: NAICS is 2 to 6 digits, NIGP class 3 digits, item 2 digits, weight 1 to 100." });
    setMsg({ ok: true, text: "Added. The next sync uses it." });
    setForm({ naics: "", nigp_class: "", nigp_item: "", weight: "70", note: "" });
    void map.reload();
  }
  async function remove(id: number) {
    if (!window.confirm("Remove this mapping?")) return;
    const { error } = await supabase.from("naics_nigp_map").delete().eq("id", id);
    setMsg(error ? { ok: false, text: "Could not remove it." } : { ok: true, text: "Removed." });
    void map.reload();
  }

  return (
    <Panel title={`NAICS to NIGP code mapping (${map.data.length})`}>
      <p className="mb-3 text-xs text-slate-600">Every bid&apos;s NAICS code is converted to these NIGP codes on each sync (one NAICS can map to several). A vendor that lists any of the NIGP codes, or the NAICS itself, is matched, scored by the weight.</p>
      {unmapped.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{unmapped.length} NAICS code{unmapped.length === 1 ? "" : "s"} on collected bids {unmapped.length === 1 ? "has" : "have"} no NIGP mapping, so no vendors are matched to {unmapped.length === 1 ? "it" : "them"}:</p>
          <p className="mt-1 flex flex-wrap gap-2">
            {unmapped.slice(0, 20).map((c) => <button key={c.naics} type="button" onClick={() => setForm((f) => ({ ...f, naics: c.naics }))} className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-semibold">{c.naics} ({c.n} bid{c.n === 1 ? "" : "s"})</button>)}
          </p>
          <p className="mt-1 text-xs">Click a code to start a mapping below.</p>
        </div>
      )}
      {msg && <p role="status" className={`mb-3 text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2">
        {([["naics", "NAICS", "w-24", "238220"], ["nigp_class", "NIGP class", "w-24", "910"], ["nigp_item", "Item", "w-20", "36"], ["weight", "Weight", "w-20", "70"], ["note", "Note", "w-56", "what this code means"]] as const).map(([k, label, w, ph]) => (
          <label key={k} className="text-xs font-semibold text-navy">{label}
            <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ph} required={k === "naics" || k === "nigp_class"} className={`${inputClass} mt-1 ${w}`} />
          </label>
        ))}
        <Button type="submit" className="!rounded-full !px-4 !py-2 text-sm">Add mapping</Button>
      </form>
      {map.error ? <p className="text-sm text-slate-500">Run <code>supabase/schema-vendors.sql</code> to turn the mapping table on.</p> : (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs text-slate-500"><tr><th className="py-1 pr-3">NAICS</th><th className="pr-3">NIGP</th><th className="pr-3">Weight</th><th>Meaning</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {map.data.map((m) => (
                <tr key={m.id}>
                  <td className="py-1 pr-3 font-medium text-navy">{m.naics}</td>
                  <td className="pr-3">{m.nigp_class}{m.nigp_item ? `-${m.nigp_item}` : " (whole class)"}</td>
                  <td className="pr-3 tabular-nums">{m.weight}</td>
                  <td className="text-xs text-slate-600">{m.note}</td>
                  <td className="text-right"><button type="button" onClick={() => remove(m.id)} aria-label={`Remove ${m.naics} to ${m.nigp_class}`} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
