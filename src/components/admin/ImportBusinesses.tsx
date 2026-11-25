import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowser } from "@/lib/supabase";
import { slugify } from "@/lib/directory";

/** Parse CSV text (quoted cells, doubled quotes, newlines inside quotes) into rows of cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const digits = (p?: string | null) => (p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const hostOf = (u?: string | null) => { try { return new URL(/^https?:\/\//i.test(u ?? "") ? (u as string) : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const keysOf = (l: { phone?: string | null; website?: string | null; email?: string | null; business_name: string; city?: string | null }) => [
  digits(l.phone) && `p:${digits(l.phone)}`,
  hostOf(l.website) && `h:${hostOf(l.website)}`,
  l.email && `e:${l.email.toLowerCase()}`,
  `n:${l.business_name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${(l.city ?? "").toLowerCase()}`,
].filter(Boolean) as string[];

/**
 * Admin > Directory > "Import CSV": adds the businesses from a Google Business export (texas.mjs) to the directory as UNCLAIMED listings.
 * Businesses already in the directory (same phone, website, email or name + city) are skipped. Needs a phone, a city and a state.
 */
export function ImportBusinesses({ onDone }: { onDone: () => void }) {
  const supabase = getSupabaseBrowser();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      const table = parseCsv(await f.text());
      const head = table[0]?.map((h) => h.trim().toLowerCase()) ?? [];
      const col = (n: string) => head.indexOf(n);
      const c = { name: col("company name"), addr: col("address"), city: col("city"), state: col("state"), zip: col("zip"), phone: col("phone"), email: col("email"), web: col("website"), cat: col("service category"), svc: col("services (from website)"), maps: col("google maps url") };
      if (c.name < 0 || c.phone < 0 || c.city < 0) throw new Error("This does not look like a businesses CSV (needs Company name, City and Phone columns).");
      const publish = window.confirm(`Import ${table.length - 1} businesses from "${f.name}"?\n\nOK = publish them now as unclaimed listings.\nCancel = stop (nothing is imported).`);
      if (!publish) return;

      // Everything already in the directory, for duplicate checks.
      const known = new Set<string>();
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await supabase.from("listings").select("business_name,city,phone,email,website").range(from, from + 999);
        if (error) throw error;
        for (const l of data) keysOf(l).forEach((k) => known.add(k));
        if (data.length < 1000) break;
      }

      const rows: Record<string, unknown>[] = [];
      let dupes = 0, incomplete = 0;
      for (const r of table.slice(1)) {
        const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
        const l = { business_name: get(c.name).slice(0, 120), city: get(c.city), state: get(c.state), phone: get(c.phone), email: get(c.email), website: get(c.web), address: get(c.addr), postal_code: get(c.zip) };
        if (l.business_name.length < 2 || !l.city || !l.state || !l.phone) { incomplete++; continue; }
        const ks = keysOf(l);
        if (ks.some((k) => known.has(k))) { dupes++; continue; }
        ks.forEach((k) => known.add(k));
        const id = crypto.randomUUID();
        const services = get(c.svc).split(";").map((s) => s.trim()).filter(Boolean).slice(0, 12);
        rows.push({
          id, slug: `${slugify(`${l.business_name} ${l.city}`)}-${id.slice(0, 4)}`, status: "published", source: "agent", unclaimed: true,
          business_name: l.business_name, description: `${l.business_name} is a ${get(c.cat) || "heating and air conditioning"} business in ${l.city}, ${l.state}. This profile was created from public business listings. The business has not claimed it yet.`.slice(0, 2000),
          services: services.length ? services : ["HVAC Services"], emergency_service: false,
          phone: l.phone, email: l.email || null, website: l.website.slice(0, 300) || null, address: l.address.slice(0, 200) || null,
          city: l.city.slice(0, 100), state: l.state.slice(0, 100), postal_code: l.postal_code.slice(0, 20) || null, service_areas: l.city,
          source_url: get(c.maps) || null, attribution: "Public business listing (Google Business). Unclaimed profile.",
        });
      }
      let added = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabase.from("listings").insert(rows.slice(i, i + 100));
        if (error) throw new Error(`Stopped after ${added} imported: ${error.message}`);
        added += Math.min(100, rows.length - i);
      }
      setMsg({ ok: true, text: `Imported ${added} unclaimed listings. Skipped ${dupes} already in the directory and ${incomplete} missing a phone, city or state.` });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} />
      <Button variant="secondary" onClick={() => file.current?.click()} disabled={busy} className="!py-2 text-sm"><Upload className="size-4" aria-hidden /> {busy ? "Importing..." : "Import CSV"}</Button>
      {msg && <p role="status" className={`basis-full rounded-xl border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
    </>
  );
}
