import { useMemo } from "react";
import { BidBoard } from "@/components/opportunities/BidBoard";
import { useLiveQuery } from "@/lib/admin-hooks";
import type { GovBid } from "@/lib/bids";
import type { Coverage } from "@/lib/permit-score";
import { getSupabaseBrowser } from "@/lib/supabase";
import { PageTitle } from "./widgets";

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

  return (
    <div className="w-full">
      <PageTitle title="Government bids" />
      <BidBoard
        bids={bids.data}
        error={bids.error}
        cover={cover}
        intro={<>
          Lead source 2 of 2. Open federal contract notices from <strong>SAM.gov</strong> for <strong>HVAC work in Texas</strong>, read every day from the government&apos;s public file. Each one is scored from 0 to 100:
          how recently it was posted (25), time left to respond (20), whether it is reserved for small businesses (20), whether it is in a city we serve (20) and what kind of notice it is (15).
          <strong> Hot</strong> is 65 or more, <strong>Warm</strong> is 35 to 64, <strong>Cold</strong> is under 35. Click a bid to see the deadline, contacts and description. The same bids show up for your business users in their dashboard under Opportunities.
        </>}
        emptyText={<>No bids yet. Run the bids import (GitHub Actions &gt; Bids import &gt; Run workflow). After that it runs by itself every day.</>}
      />
    </div>
  );
}
