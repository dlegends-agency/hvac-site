import { useMemo } from "react";
import { BidBoard } from "@/components/opportunities/BidBoard";
import { useLiveQuery } from "@/lib/admin-hooks";
import type { GovBid } from "@/lib/bids";
import type { Coverage } from "@/lib/permit-score";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { downloadCsv } from "@/lib/csv-export";
import { PageTitle, StatStrip } from "./widgets";

/** Lead source 2: open federal contract notices from SAM.gov for HVAC work in Texas, ranked Hot, Warm and Cold. */
export function BidsAdmin() {
  const supabase = getSupabaseBrowser();
  const bids = useLiveQuery<GovBid[]>(
    [],
    () => supabase.from("gov_bids").select("*").order("posted_at", { ascending: false, nullsFirst: false }).limit(1000),
    { key: "gov-bids", intervalMs: 120_000 },
  );
  const listings = useLiveQuery<{ city: string | null; status: string }[]>([], () => supabase.from("listings").select("city, status").limit(5000), { key: "bids-listings", intervalMs: null });
  const cover = useMemo<Coverage>(() => {
    const published = listings.data.filter((l) => l.status === "published");
    return { cities: new Set(published.map((l) => (l.city ?? "").trim().toLowerCase()).filter(Boolean)), stateCovered: published.length > 0 };
  }, [listings.data]);

  const withContact = bids.data.filter((b) => (b.contacts ?? []).some((c) => c.email && c.phone && c.name)).length;
  const latest = bids.data.reduce((m, b) => (b.imported_at > m ? b.imported_at : m), "");
  function exportContacts() {
    const rows: unknown[][] = [["Contact name", "Title", "Phone", "Email", "Agency", "Notice", "Solicitation number", "City", "Response due", "Set-aside", "SAM.gov link"]];
    for (const b of bids.data) for (const c of b.contacts ?? []) if (c.email && c.phone && c.name) rows.push([c.name, c.title, c.phone, c.email, b.agency, b.title, b.solicitation_number, b.city, b.response_due, b.set_aside, b.sam_url]);
    downloadCsv("bid-contacts", rows);
  }

  return (
    <div className="w-full">
      <PageTitle title="Government bids" description="Lead source 2 of 2: open federal HVAC notices in Texas from SAM.gov. Only notices with a contact name, phone and email are kept.">
        <Button variant="secondary" onClick={exportContacts} disabled={withContact === 0} className="!py-2 text-sm"><Download className="size-4" aria-hidden /> Export contacts (CSV)</Button>
      </PageTitle>
      <StatStrip items={[
        { label: "Open bids", value: bids.data.length.toLocaleString() },
        { label: "With name, phone and email", value: withContact.toLocaleString(), tone: withContact === bids.data.length ? "good" : "warn" },
        { label: "Last scrape", value: latest ? new Date(latest).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never" },
        { label: "Next scrape", value: "Daily 8:30 AM PH" },
      ]} />
      <BidBoard
        bids={bids.data}
        error={bids.error}
        cover={cover}
        intro={<>
          Each bid is scored from 0 to 100: how recently it was posted (25), time left to respond (20), whether it is reserved for small businesses (20), whether it is in a city we serve (20) and the kind of notice (15). <strong>Hot</strong> is 65 or more, <strong>Warm</strong> is 35 to 64, <strong>Cold</strong> is under 35. Click a bid to see the deadline, contacts and description. Your business users see the same bids under Opportunities.
        </>}
        emptyText={<>No bids yet. Run the bids import (GitHub Actions &gt; Bids import &gt; Run workflow). After that it runs by itself every day.</>}
      />
    </div>
  );
}
